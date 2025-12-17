const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const { createLogger } = require('../../src/utils/logger');
const { JIRA_STATUS, COLORS, TIMEOUTS, FORUM } = require('../../src/utils/constants');
const { isValidTicketKey } = require('../../src/utils/validators');
const userLookupService = require('../../src/services/userLookupService');
const threadService = require('../../src/services/threadService');

const logger = createLogger('Task');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('task')
        .setDescription('Manage your Jira tasks')
        .addSubcommand(subcommand =>
            subcommand
                .setName('review')
                .setDescription('Submit a task for PM review')
                .addStringOption(option =>
                    option.setName('ticket')
                        .setDescription('Jira ticket key (e.g., KAN-123)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('done')
                .setDescription('Mark a task as done (PM only)')
                .addStringOption(option =>
                    option.setName('ticket')
                        .setDescription('Jira ticket key (e.g., KAN-123)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('deny')
                .setDescription('Deny a task review and send back to In Progress (PM only)')
                .addStringOption(option =>
                    option.setName('ticket')
                        .setDescription('Jira ticket key (e.g., KAN-123)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for denial (optional)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('quit')
                .setDescription('Unassign yourself from a task')
                .addStringOption(option =>
                    option.setName('ticket')
                        .setDescription('Jira ticket key (e.g., KAN-123)')
                        .setRequired(true))),

    async execute(interaction, client, config) {
        const subcommand = interaction.options.getSubcommand();
        const ticketKey = interaction.options.getString('ticket').toUpperCase();

        // Validate ticket format
        if (!isValidTicketKey(ticketKey)) {
            return interaction.reply({
                content: '❌ Invalid ticket format. Use format like `KAN-123`.',
                flags: 64
            });
        }

        await interaction.deferReply({ flags: 64 });

        if (subcommand === 'review') {
            await handleReview(interaction, client, config, ticketKey);
        } else if (subcommand === 'done') {
            await handleDone(interaction, client, config, ticketKey);
        } else if (subcommand === 'deny') {
            await handleDeny(interaction, client, config, ticketKey);
        } else if (subcommand === 'quit') {
            await handleQuit(interaction, client, config, ticketKey);
        }
    }
};

async function handleReview(interaction, client, config, ticketKey) {
    try {
        // Move ticket to In Review in Jira
        const response = await fetch(`${config.n8nBaseUrl}${config.webhooks.moveTicket}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jiraTicketKey: ticketKey,
                targetStatus: JIRA_STATUS.IN_REVIEW,
                submittedBy: interaction.user.tag,
                discordUserId: interaction.user.id
            })
        });

        const result = await response.json();

        if (!result.success) {
            return interaction.editReply({
                content: `❌ Could not move ticket: ${result.error || 'Unknown error'}`
            });
        }

        // Post to tasks-for-review forum
        const guild = interaction.guild;
        const reviewForum = guild.channels.cache.get(config.channels.tasksForReview);

        if (reviewForum && reviewForum.type === ChannelType.GuildForum) {
            const thread = await reviewForum.threads.create({
                name: `${ticketKey}: ${result.summary || 'Review Request'}`,
                message: {
                    embeds: [{
                        title: `📋 ${ticketKey}: ${result.summary || 'Task'}`,
                        url: `${config.jiraBaseUrl}/browse/${ticketKey}`,
                        description: `Submitted for review by <@${interaction.user.id}>`,
                        color: COLORS.IN_REVIEW,
                        fields: [
                            { name: 'Status', value: JIRA_STATUS.IN_REVIEW, inline: true },
                            { name: 'Submitted By', value: interaction.user.tag, inline: true }
                        ],
                        footer: { text: 'React with ✅ to approve | React with ❌ to deny' },
                        timestamp: new Date().toISOString()
                    }]
                }
            });

            // Add default reactions for easy approval/denial
            const starterMessage = await thread.fetchStarterMessage();
            if (starterMessage) {
                await starterMessage.react('✅');
                await starterMessage.react('❌');
            }

            // Ping PM role
            await thread.send({
                content: `<@&${config.roles.pm}> New task ready for review!`,
                allowedMentions: { roles: [config.roles.pm] }
            });
        }

        await interaction.editReply({
            content: `✅ **${ticketKey}** submitted for review! PMs have been notified.`
        });

    } catch (error) {
        logger.error('Error submitting for review:', error);
        await interaction.editReply({
            content: `⚠️ Error: ${error.message}`
        });
    }
}

async function handleDone(interaction, client, config, ticketKey) {
    // Check if user has PM role
    const member = await interaction.guild.members.fetch(interaction.user.id);
    
    if (!member.roles.cache.has(config.roles.pm)) {
        return interaction.editReply({
            content: '❌ Only PMs can mark tasks as done.'
        });
    }

    try {
        const response = await fetch(`${config.n8nBaseUrl}${config.webhooks.moveTicket}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jiraTicketKey: ticketKey,
                targetStatus: JIRA_STATUS.DONE,
                approvedBy: interaction.user.tag
            })
        });

        const result = await response.json();

        if (!result.success) {
            return interaction.editReply({
                content: `❌ Could not move ticket: ${result.error || 'Unknown error'}`
            });
        }

        const guild = interaction.guild;

        // Find the assignee's Discord user and their forum
        const { discordUserId, discordUser } = await userLookupService.lookupDiscordUser(
            guild,
            result.assignee?.emailAddress
        );

        // Delete the thread in the user's working tickets forum
        const workingCategory = guild.channels.cache.get(config.categories.workingTickets);
        let ticketThread = null;

        if (workingCategory) {
            const { userForum, ticketThread: foundThread } = await userLookupService.findUserForum(
                workingCategory,
                discordUserId,
                discordUser,
                ticketKey
            );
            ticketThread = foundThread;

            // If we found forum but not thread via Tier 3, search for thread
            if (userForum && !ticketThread) {
                ticketThread = await userLookupService.findTicketThread(userForum, ticketKey);
            }

            if (ticketThread) {
                threadService.deleteThreadWithDelay(
                    ticketThread,
                    'Task completed - moved to completed tasks',
                    TIMEOUTS.THREAD_DELETE_SHORT
                );
            }
        }

        // Delete any review threads for this ticket
        const reviewForum = guild.channels.cache.get(config.channels.tasksForReview);
        if (reviewForum && reviewForum.type === ChannelType.GuildForum) {
            const reviewThread = await threadService.findTicketThread(reviewForum, ticketKey);

            if (reviewThread) {
                threadService.deleteThreadWithDelay(
                    reviewThread,
                    'Task approved - moved to completed tasks',
                    TIMEOUTS.THREAD_DELETE_MEDIUM
                );
            }
        }

        // Create thread in Completed Tasks forum
        await createCompletedTaskThread(guild, config, ticketKey, result, interaction.user);

        await interaction.editReply({
            content: `✅ **${ticketKey}** marked as **Done** and moved to Completed Tasks!`
        });

    } catch (error) {
        logger.error('Error marking done:', error);
        await interaction.editReply({
            content: `⚠️ Error: ${error.message}`
        });
    }
}

async function handleDeny(interaction, client, config, ticketKey) {
    // Check if user has PM role
    const member = await interaction.guild.members.fetch(interaction.user.id);
    
    if (!member.roles.cache.has(config.roles.pm)) {
        return interaction.editReply({
            content: '❌ Only PMs can deny task reviews.'
        });
    }

    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
        // Move ticket back to In Progress
        const response = await fetch(`${config.n8nBaseUrl}${config.webhooks.moveTicket}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jiraTicketKey: ticketKey,
                targetStatus: JIRA_STATUS.IN_PROGRESS,
                deniedBy: interaction.user.tag
            })
        });

        const result = await response.json();

        if (!result.success) {
            return interaction.editReply({
                content: `❌ Could not deny ticket: ${result.error || 'Unknown error'}`
            });
        }

        const guild = interaction.guild;

        // Find the assignee's Discord user and their forum
        const { discordUserId, discordUser } = await userLookupService.lookupDiscordUser(
            guild,
            result.assignee?.emailAddress
        );

        // Delete any review threads for this ticket (result is pushed to working thread)
        const reviewForum = guild.channels.cache.get(config.channels.tasksForReview);
        if (reviewForum && reviewForum.type === ChannelType.GuildForum) {
            const reviewThread = await threadService.findTicketThread(reviewForum, ticketKey);

            if (reviewThread) {
                threadService.deleteThreadWithDelay(
                    reviewThread,
                    'Review denied - feedback sent to working thread',
                    TIMEOUTS.THREAD_DELETE_SHORT
                );
            }
        }

        // Notify in the assignee's working tickets thread
        const workingCategory = guild.channels.cache.get(config.categories.workingTickets);

        if (workingCategory) {
            const { userForum, ticketThread: foundThread } = await userLookupService.findUserForum(
                workingCategory,
                discordUserId,
                discordUser,
                ticketKey
            );
            let ticketThread = foundThread;

            // If we found forum but not thread via Tier 3, search for thread
            if (userForum && !ticketThread) {
                ticketThread = await userLookupService.findTicketThread(userForum, ticketKey);
            }

            if (ticketThread) {
                // Unarchive if needed
                if (ticketThread.archived) {
                    await ticketThread.setArchived(false);
                }
                // Ping the assignee so they get notified
                const assigneePing = discordUserId ? `<@${discordUserId}> - ` : '';
                await ticketThread.send({
                    content: `${assigneePing}⚠️ **Review Denied** by <@${interaction.user.id}>.\n**Reason:** ${reason}\n\nPlease address the feedback and use \`/task review ${ticketKey}\` when ready to resubmit.`
                });
                logger.debug(`Posted denial message to working thread for ${ticketKey}`);
            }
        }

        await interaction.editReply({
            content: `❌ **${ticketKey}** review denied and sent back to **In Progress**.\nAssignee has been notified.`
        });

    } catch (error) {
        logger.error('Error denying ticket:', error);
        await interaction.editReply({
            content: `⚠️ Error: ${error.message}`
        });
    }
}

async function createCompletedTaskThread(guild, config, ticketKey, ticketInfo, approver) {
    try {
        logger.debug(`Creating completed task thread for ${ticketKey}...`);

        const assigneeName = ticketInfo.assignee?.displayName || ticketInfo.assignee?.name || 'Unassigned';
        const forumName = `tasks-${assigneeName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

        logger.debug(`Assignee: ${assigneeName}, Forum name: ${forumName}`);

        // Look for existing forum channel in the completed tasks category (same pattern as working tickets)
        const completedCategory = guild.channels.cache.get(config.categories.completedTasks);
        let userForum = null;
        
        if (completedCategory) {
            userForum = completedCategory.children?.cache.find(
                ch => ch.name === forumName && ch.type === ChannelType.GuildForum
            );
        }

        // Create forum if doesn't exist (same pattern as working tickets)
        if (!userForum) {
            logger.debug(`Forum ${forumName} not found in completed tasks, creating...`);
            try {
                userForum = await guild.channels.create({
                    name: forumName,
                    type: ChannelType.GuildForum,
                    parent: config.categories.completedTasks,
                    topic: `Completed tasks for ${assigneeName}`,
                    defaultAutoArchiveDuration: FORUM.AUTO_ARCHIVE_DURATION
                });
                logger.info(`✅ Created completed tasks forum: ${forumName} (ID: ${userForum.id})`);
            } catch (error) {
                logger.error('Error creating completed tasks forum:', error);
                return;
            }
        } else {
            logger.debug(`Found existing completed tasks forum: ${forumName}`);
        }

        // Create thread for the completed task
        await userForum.threads.create({
            name: `✅ ${ticketKey}: ${ticketInfo.summary || 'Completed Task'}`,
            message: {
                embeds: [{
                    title: `✅ ${ticketKey}: ${ticketInfo.summary || 'Task'}`,
                    url: `${config.jiraBaseUrl}/browse/${ticketKey}`,
                    description: `Task completed and approved!`,
                    color: COLORS.DONE,
                    fields: [
                        { name: 'Status', value: JIRA_STATUS.DONE, inline: true },
                        { name: 'Completed By', value: assigneeName, inline: true },
                        { name: 'Approved By', value: approver.tag, inline: true }
                    ],
                    footer: { text: 'Great work! 🎉' },
                    timestamp: new Date().toISOString()
                }]
            }
        });

        logger.info(`✅ Created completed task thread for ${ticketKey} in ${forumName}`);
    } catch (error) {
        logger.error('Error creating completed task thread:', error);
        logger.error('Error stack:', error.stack);
    }
}

async function handleQuit(interaction, client, config, ticketKey) {
    try {
        const response = await fetch(`${config.n8nBaseUrl}/webhook/quit-ticket`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jiraTicketKey: ticketKey,
                discordUserId: interaction.user.id,
                discordUsername: interaction.user.username
            })
        });

        const result = await response.json();

        if (!result.success) {
            return interaction.editReply({
                content: `❌ Could not quit ticket: ${result.error || 'Unknown error'}`
            });
        }

        // Try to archive the thread in user's personal forum
        const guild = interaction.guild;
        const workingCategory = guild.channels.cache.get(config.categories.workingTickets);
        const forumName = `tasks-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        
        if (workingCategory) {
            const taskForum = workingCategory.children?.cache.find(
                ch => ch.name === forumName && ch.type === ChannelType.GuildForum
            );

            if (taskForum) {
                // Find and archive the thread for this ticket
                const ticketThread = await threadService.findTicketThread(taskForum, ticketKey);
                if (ticketThread) {
                    await ticketThread.send({
                        content: `🚪 Task unassigned by <@${interaction.user.id}>. Ticket moved back to **${JIRA_STATUS.TO_DO}**.`
                    });
                    threadService.archiveThreadWithDelay(ticketThread, TIMEOUTS.THREAD_DELETE_SHORT);
                }
            }
        }

        await interaction.editReply({
            content: `🚪 You've been unassigned from **${ticketKey}**. The ticket has been moved back to **${JIRA_STATUS.TO_DO}**.`
        });

    } catch (error) {
        logger.error('Error quitting ticket:', error);
        await interaction.editReply({
            content: `⚠️ Error: ${error.message}`
        });
    }
}
