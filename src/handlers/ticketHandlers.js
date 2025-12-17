/**
 * Ticket Handlers Module
 *
 * Handles ticket workflow actions: claim, approve, and deny.
 * Extracted from reactionHandler.js for better separation of concerns.
 */

const { createLogger } = require('../utils/logger');
const { JIRA_STATUS, TIMEOUTS } = require('../utils/constants');
const { PermissionError, WebhookError } = require('../utils/errors');
const userLookupService = require('../services/userLookupService');
const threadService = require('../services/threadService');
const forumService = require('../services/forumService');
const taskManagementService = require('../services/taskManagementService');

const logger = createLogger('TicketHandlers');

/**
 * Check if a user has the PM role
 * @param {import('discord.js').Guild} guild - The guild
 * @param {string} userId - The user ID to check
 * @param {Object} config - Bot configuration
 * @returns {Promise<boolean>} True if user has PM role
 */
async function checkPmRole(guild, userId, config) {
    const member = await guild.members.fetch(userId);
    return member.roles.cache.has(config.roles.pm);
}

/**
 * Handle claiming a ticket from unassigned forum
 * @param {import('discord.js').MessageReaction} reaction - The reaction object
 * @param {import('discord.js').User} user - The user claiming
 * @param {string} jiraTicketKey - The Jira ticket key
 * @param {import('discord.js').ThreadChannel} thread - The thread channel
 * @param {Object} config - Bot configuration
 */
async function handleClaimTicket(reaction, user, jiraTicketKey, thread, config) {
    logger.info(`User ${user.tag} claiming ticket ${jiraTicketKey}`);

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

        if (!result.success) {
            throw new WebhookError(
                result.error || 'Unknown error from webhook',
                jiraTicketKey,
                config.webhooks.assignTicket
            );
        }

        // Send confirmation in thread
        await thread.send({
            content: `<@${user.id}> claimed this ticket! Moving to **In Progress**. This thread will be deleted.`,
            allowedMentions: { users: [user.id] }
        });

        // Create or update user's private task forum with description
        const guild = thread.guild;
        const taskForum = await forumService.findOrCreateUserTaskForum(
            guild, user, config.categories.workingTickets
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

        logger.info(`Ticket ${jiraTicketKey} claimed by ${user.tag}`);
    } catch (error) {
        if (error instanceof WebhookError) {
            logger.error(`Webhook error claiming ticket ${jiraTicketKey}:`, error.message);
            await thread.send({
                content: `<@${user.id}> Could not claim ticket: ${error.message}. Make sure you've registered with \`/register\`.`,
                allowedMentions: { users: [user.id] }
            });
        } else {
            logger.error(`Error claiming ticket ${jiraTicketKey}:`, error);
            await thread.send({
                content: `<@${user.id}> Error processing claim: ${error.message}`,
                allowedMentions: { users: [user.id] }
            });
        }
    }
}

/**
 * Handle PM approving a ticket in review
 * @param {import('discord.js').MessageReaction} reaction - The reaction object
 * @param {import('discord.js').User} user - The PM approving
 * @param {string} jiraTicketKey - The Jira ticket key
 * @param {import('discord.js').ThreadChannel} thread - The thread channel
 * @param {Object} config - Bot configuration
 */
async function handleApproveTicket(reaction, user, jiraTicketKey, thread, config) {
    const guild = thread.guild;

    // Check if user has PM role
    try {
        const hasPmRole = await checkPmRole(guild, user.id, config);
        if (!hasPmRole) {
            throw new PermissionError('Only PMs can approve tickets.', 'pm');
        }
    } catch (error) {
        if (error instanceof PermissionError) {
            await thread.send({
                content: `<@${user.id}> ${error.message}`,
                allowedMentions: { users: [user.id] }
            });
            return;
        }
        throw error;
    }

    logger.info(`PM ${user.tag} approving ticket ${jiraTicketKey}`);

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

        if (!result.success) {
            throw new WebhookError(
                result.error || 'Unknown error from webhook',
                jiraTicketKey,
                config.webhooks.moveTicket
            );
        }

        await thread.send({
            content: `Ticket **${jiraTicketKey}** approved by <@${user.id}> and moved to **Done**! Cleaning up threads...`,
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
    } catch (error) {
        if (error instanceof WebhookError) {
            logger.error(`Webhook error approving ticket ${jiraTicketKey}:`, error.message);
            await thread.send({
                content: `Could not approve ticket: ${error.message}`,
            });
        } else {
            logger.error(`Error approving ticket ${jiraTicketKey}:`, error);
            await thread.send({ content: `Error: ${error.message}` });
        }
    }
}

/**
 * Handle PM denying a ticket in review - sends it back to In Progress
 * @param {import('discord.js').MessageReaction} reaction - The reaction object
 * @param {import('discord.js').User} user - The PM denying
 * @param {string} jiraTicketKey - The Jira ticket key
 * @param {import('discord.js').ThreadChannel} thread - The thread channel
 * @param {Object} config - Bot configuration
 */
async function handleDenyTicket(reaction, user, jiraTicketKey, thread, config) {
    const guild = thread.guild;

    // Check if user has PM role
    try {
        const hasPmRole = await checkPmRole(guild, user.id, config);
        if (!hasPmRole) {
            throw new PermissionError('Only PMs can deny tickets.', 'pm');
        }
    } catch (error) {
        if (error instanceof PermissionError) {
            await thread.send({
                content: `<@${user.id}> ${error.message}`,
                allowedMentions: { users: [user.id] }
            });
            return;
        }
        throw error;
    }

    logger.info(`PM ${user.tag} denying ticket ${jiraTicketKey}`);

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

        if (!result.success) {
            throw new WebhookError(
                result.error || 'Unknown error from webhook',
                jiraTicketKey,
                config.webhooks.moveTicket
            );
        }

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
                        content: `${assigneePing}**Review Denied** by <@${user.id}>.\n\n**Reason:** Please review feedback in the review thread or contact the PM for details.\n\nYour task has been sent back to **In Progress**. Use \`/task review ${jiraTicketKey}\` when ready to resubmit.`
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
    } catch (error) {
        if (error instanceof WebhookError) {
            logger.error(`Webhook error denying ticket ${jiraTicketKey}:`, error.message);
            await thread.send({
                content: `Could not deny ticket: ${error.message}`,
            });
        } else {
            logger.error(`Error denying ticket ${jiraTicketKey}:`, error);
            await thread.send({ content: `Error: ${error.message}` });
        }
    }
}

/**
 * Handle user submitting their task for PM review via clipboard reaction
 * @param {import('discord.js').MessageReaction} reaction - The reaction object
 * @param {import('discord.js').User} user - The user who reacted
 * @param {string} jiraTicketKey - The Jira ticket key
 * @param {import('discord.js').ThreadChannel} thread - The thread channel
 * @param {Object} config - Bot configuration
 */
async function handleSubmitForReview(reaction, user, jiraTicketKey, thread, config) {
    // Always remove reaction first to allow re-submission
    try {
        await reaction.users.remove(user.id);
    } catch (error) {
        logger.debug(`Could not remove reaction: ${error.message}`);
    }

    // Verify ownership: thread.parent should be user's forum
    const forumChannel = thread.parent;
    if (!forumChannel) {
        logger.debug(`No parent forum found for thread ${thread.id}`);
        return;
    }

    const expectedForumName = `tasks-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (forumChannel.name !== expectedForumName) {
        // Non-assignee: silently ignore
        logger.debug(`User ${user.tag} is not owner of forum ${forumChannel.name}`);
        return;
    }

    logger.info(`User ${user.tag} submitting ticket ${jiraTicketKey} for review`);

    try {
        const result = await taskManagementService.submitForReview({
            ticketKey: jiraTicketKey,
            userId: user.id,
            userTag: user.tag,
            guild: thread.guild
        });

        if (!result.success) {
            await thread.send({
                content: `<@${user.id}> Could not submit for review: ${result.error}`,
                allowedMentions: { users: [user.id] }
            });
            return;
        }

        await thread.send({ content: `Submitted for review! PMs have been notified.` });
        logger.info(`Ticket ${jiraTicketKey} submitted for review by ${user.tag}`);
    } catch (error) {
        logger.error(`Error submitting ticket ${jiraTicketKey} for review:`, error);
        await thread.send({
            content: `<@${user.id}> Error submitting for review: ${error.message}`,
            allowedMentions: { users: [user.id] }
        });
    }
}

module.exports = {
    handleClaimTicket,
    handleApproveTicket,
    handleDenyTicket,
    handleSubmitForReview
};
