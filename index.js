require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const config = require('./src/config');
const { createLogger } = require('./src/utils/logger');
const { EMOJIS, JIRA_STATUS, TIMEOUTS } = require('./src/utils/constants');
const { extractTicketKey } = require('./src/utils/validators');
const userLookupService = require('./src/services/userLookupService');
const threadService = require('./src/services/threadService');
const forumService = require('./src/services/forumService');

const logger = createLogger('Bot');
const {
    Client,
    Collection,
    Events,
    GatewayIntentBits,
    Partials,
    ChannelType,
    EmbedBuilder
} = require('discord.js');

// Create client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.ThreadMember]
});

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands', 'utility');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Store for tracking forum posts (ticket key -> thread ID mapping)
const ticketThreadMap = new Map();

// Ready event
client.once(Events.ClientReady, readyClient => {
    logger.info(`✅ Discord bot ready! Logged in as ${readyClient.user.tag}`);
    logger.info(`🔗 Connected to n8n at: ${config.n8nBaseUrl}`);
    logger.info(`📁 Forum channels configured:`);
    logger.debug(`   Code: ${config.channels.codeUnassigned}`);
    logger.debug(`   Art: ${config.channels.artUnassigned}`);
    logger.debug(`   Audio: ${config.channels.audioUnassigned}`);
    logger.debug(`   Review: ${config.channels.tasksForReview}`);
    logger.debug(`   Working Tickets Category: ${config.categories.workingTickets}`);
});

// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        logger.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction, client, config);
    } catch (error) {
        logger.error('Command execution error:', error);
        const errorMessage = { content: 'There was an error while executing this command!', flags: 64 };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

// Handle reaction add events (for claiming tickets and approving reviews)
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    // Ignore bot reactions
    if (user.bot) return;

    // Handle partial reactions
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            logger.error('Error fetching reaction:', error);
            return;
        }
    }

    // Check if it's a checkmark or X emoji
    const emojiName = reaction.emoji.name;

    const isCheckmark = EMOJIS.CHECKMARKS.includes(emojiName);
    const isDeny = EMOJIS.DENY.includes(emojiName);
    
    if (!isCheckmark && !isDeny) return;

    const message = reaction.message;
    const channel = message.channel;

    // Check if this is a forum thread
    if (channel.type !== ChannelType.PublicThread && channel.type !== ChannelType.PrivateThread) {
        return;
    }

    const parentId = channel.parentId;
    
    // Extract Jira ticket key from thread name or message
    let jiraTicketKey = null;
    
    // Try thread name first (format: "KAN-123: Title")
    jiraTicketKey = extractTicketKey(channel.name);
    
    // Also check message embeds and content
    if (!jiraTicketKey && message.embeds && message.embeds.length > 0) {
        for (const embed of message.embeds) {
            jiraTicketKey = extractTicketKey(embed.title);
            if (!jiraTicketKey) {
                // Fallback: extract from URL
                const urlMatch = embed.url?.match(/browse\/([A-Z]+-\d+)/);
                if (urlMatch) jiraTicketKey = urlMatch[1];
            }
            if (jiraTicketKey) break;
        }
    }

    if (!jiraTicketKey) {
        logger.debug('No Jira ticket found in thread/message');
        return;
    }

    // Determine what action based on which forum channel and emoji
    const unassignedChannels = [
        config.channels.codeUnassigned,
        config.channels.artUnassigned,
        config.channels.audioUnassigned
    ];

    if (isCheckmark && unassignedChannels.includes(parentId)) {
        // User is claiming a ticket
        await handleClaimTicket(reaction, user, jiraTicketKey, channel);
    } else if (parentId === config.channels.tasksForReview) {
        if (isCheckmark) {
            // PM is approving a ticket
            await handleApproveTicket(reaction, user, jiraTicketKey, channel);
        } else if (isDeny) {
            // PM is denying a ticket
            await handleDenyTicket(reaction, user, jiraTicketKey, channel);
        }
    }
});

// Handle claiming a ticket from unassigned forum
async function handleClaimTicket(reaction, user, jiraTicketKey, thread) {
    logger.info(`✅ User ${user.tag} claiming ticket ${jiraTicketKey}`);

    try {
        const response = await fetch(`${config.n8nBaseUrl}${config.webhooks.assignTicket}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                discordUserId: user.id,
                discordUsername: user.username,
                discordTag: user.tag,
                jiraTicketKey: jiraTicketKey,
                threadId: thread.id,
                action: 'claim'
            })
        });

        const result = await response.json();
        
        if (result.success) {
            // Send confirmation in thread
            await thread.send({
                content: `✅ <@${user.id}> claimed this ticket! Moving to **In Progress**. This thread will be deleted.`,
                allowedMentions: { users: [user.id] }
            });

            // Create or update user's private task forum with description
            const taskForum = await forumService.findOrCreateUserTaskForum(
                guild, user, config.categories.workingTickets, client
            );
            if (taskForum) {
                await forumService.createTaskThread(taskForum, {
                    ticketKey: jiraTicketKey,
                    title: result.summary || thread.name,
                    description: result.description,
                    priority: result.priority,
                    labels: result.labels,
                    userId: user.id
                });
            }

            // Delete the unassigned thread after a short delay
            threadService.deleteThreadWithDelay(
                thread,
                'Ticket claimed - moved to working tickets',
                TIMEOUTS.THREAD_DELETE_LONG,
                true // fallbackToArchive
            );

            logger.info(`✅ Ticket ${jiraTicketKey} claimed by ${user.tag}`);
        } else {
            await thread.send({
                content: `❌ <@${user.id}> Could not claim ticket: ${result.error || 'Unknown error'}. Make sure you've registered with \`/register\`.`,
                allowedMentions: { users: [user.id] }
            });
        }
    } catch (error) {
        logger.error('Error claiming ticket:', error);
        await thread.send({
            content: `⚠️ <@${user.id}> Error processing claim: ${error.message}`,
            allowedMentions: { users: [user.id] }
        });
    }
}

// Handle PM approving a ticket in review
async function handleApproveTicket(reaction, user, jiraTicketKey, thread) {
    // Check if user has PM role
    const guild = thread.guild;
    const member = await guild.members.fetch(user.id);
    
    if (!member.roles.cache.has(config.roles.pm)) {
        await thread.send({
            content: `❌ <@${user.id}> Only PMs can approve tickets.`,
            allowedMentions: { users: [user.id] }
        });
        return;
    }

    logger.info(`✅ PM ${user.tag} approving ticket ${jiraTicketKey}`);

    try {
        const response = await fetch(`${config.n8nBaseUrl}${config.webhooks.moveTicket}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jiraTicketKey: jiraTicketKey,
                targetStatus: JIRA_STATUS.DONE,
                approvedBy: user.tag
            })
        });

        const result = await response.json();
        
        if (result.success) {
            await thread.send({
                content: `✅ Ticket **${jiraTicketKey}** approved by <@${user.id}> and moved to **Done**! Cleaning up threads...`,
                allowedMentions: { users: [user.id] }
            });

            // Find the assignee's Discord user and their forum
            const { discordUserId, discordUser } = await userLookupService.lookupDiscordUser(
                guild,
                result.assignee?.emailAddress
            );

            const workingCategory = guild.channels.cache.get(config.categories.workingTickets);
            let ticketThread = null;

            if (workingCategory) {
                const { userForum, ticketThread: foundThread } = await userLookupService.findUserForum(
                    workingCategory,
                    discordUserId,
                    discordUser,
                    jiraTicketKey
                );
                ticketThread = foundThread;

                // If we found forum but not thread via Tier 3, search for thread
                if (userForum && !ticketThread) {
                    ticketThread = await userLookupService.findTicketThread(userForum, jiraTicketKey);
                }

                if (ticketThread) {
                    threadService.deleteThreadWithDelay(
                        ticketThread,
                        'Task completed - moved to completed tasks',
                        TIMEOUTS.THREAD_DELETE_SHORT
                    );
                }
            }

            // Create thread in Completed Tasks forum
            await forumService.createCompletedTaskThread(guild, jiraTicketKey, result, user);

            // Delete the review thread
            threadService.deleteThreadWithDelay(
                thread,
                'Task approved - moved to completed tasks',
                TIMEOUTS.THREAD_DELETE_LONG
            );
        } else {
            await thread.send({
                content: `❌ Could not approve ticket: ${result.error || 'Unknown error'}`,
            });
        }
    } catch (error) {
        logger.error('Error approving ticket:', error);
        await thread.send({ content: `⚠️ Error: ${error.message}` });
    }
}

// Handle PM denying a ticket in review - sends it back to In Progress
async function handleDenyTicket(reaction, user, jiraTicketKey, thread) {
    // Check if user has PM role
    const guild = thread.guild;
    const member = await guild.members.fetch(user.id);
    
    if (!member.roles.cache.has(config.roles.pm)) {
        await thread.send({
            content: `❌ <@${user.id}> Only PMs can deny tickets.`,
            allowedMentions: { users: [user.id] }
        });
        return;
    }

    logger.info(`❌ PM ${user.tag} denying ticket ${jiraTicketKey}`);

    try {
        // Move ticket back to In Progress
        const response = await fetch(`${config.n8nBaseUrl}${config.webhooks.moveTicket}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jiraTicketKey: jiraTicketKey,
                targetStatus: JIRA_STATUS.IN_PROGRESS,
                deniedBy: user.tag
            })
        });

        const result = await response.json();
        
        if (result.success) {
            // Find the assignee's Discord user and their forum
            const { discordUserId, discordUser } = await userLookupService.lookupDiscordUser(
                guild,
                result.assignee?.emailAddress
            );

            const workingCategory = guild.channels.cache.get(config.categories.workingTickets);

            if (workingCategory) {
                const { userForum, ticketThread: foundThread } = await userLookupService.findUserForum(
                    workingCategory,
                    discordUserId,
                    discordUser,
                    jiraTicketKey
                );
                let ticketThread = foundThread;

                if (userForum) {
                    logger.debug(`Found working forum: ${userForum.name}`);

                    // If we didn't already find the thread in the last-resort search, find it now
                    if (!ticketThread) {
                        ticketThread = await userLookupService.findTicketThread(userForum, jiraTicketKey);
                    }

                    if (ticketThread) {
                        logger.debug(`Found ticket thread: ${ticketThread.name}`);
                        // Unarchive if needed
                        if (ticketThread.archived) {
                            await ticketThread.setArchived(false);
                        }
                        // Post denial message with default reason since emoji doesn't allow custom reason
                        // Ping the assignee so they get notified
                        const assigneePing = discordUserId ? `<@${discordUserId}> - ` : '';
                        await ticketThread.send({
                            content: `${assigneePing}⚠️ **Review Denied** by <@${user.id}>.\n\n**Reason:** Please review feedback in the review thread or contact the PM for details.\n\nYour task has been sent back to **In Progress**. Use \`/task review ${jiraTicketKey}\` when ready to resubmit.`
                        });
                        logger.debug(`Posted denial message to working thread for ${jiraTicketKey}`);
                    } else {
                        logger.debug(`Could not find ticket thread starting with ${jiraTicketKey}`);
                    }
                } else {
                    logger.debug(`Could not find working forum for user`);
                }
            } else {
                logger.debug(`Could not find working category: ${config.categories.workingTickets}`);
            }

            // Delete the review thread (result is pushed to working thread)
            threadService.deleteThreadWithDelay(
                thread,
                'Review denied - feedback sent to working thread',
                TIMEOUTS.THREAD_DELETE_SHORT
            );
        } else {
            await thread.send({
                content: `❌ Could not deny ticket: ${result.error || 'Unknown error'}`,
            });
        }
    } catch (error) {
        logger.error('Error denying ticket:', error);
        await thread.send({ content: `⚠️ Error: ${error.message}` });
    }
}

// Export for use in commands
client.ticketThreadMap = ticketThreadMap;

// Login
client.login(config.token);
