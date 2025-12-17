/**
 * Task Management Service
 *
 * Orchestrates task lifecycle operations: review, done, deny, quit.
 * Coordinates between n8nService, userLookupService, threadService, and forumService.
 */

const { ChannelType } = require('discord.js');
const config = require('../config');
const n8nService = require('./n8nService');
const userLookupService = require('./userLookupService');
const threadService = require('./threadService');
const forumService = require('./forumService');
const { createLogger } = require('../utils/logger');
const { JIRA_STATUS, COLORS, TIMEOUTS } = require('../utils/constants');

const logger = createLogger('TaskManagementService');

/**
 * Submit a ticket for PM review
 * @param {Object} params
 * @param {string} params.ticketKey - Jira ticket key
 * @param {string} params.userId - Discord user ID
 * @param {string} params.userTag - Discord user tag
 * @param {import('discord.js').Guild} params.guild - Discord guild
 * @returns {Promise<{success: boolean, error?: string, summary?: string}>}
 */
async function submitForReview({ ticketKey, userId, userTag, guild }) {
    const result = await n8nService.moveTicket(ticketKey, JIRA_STATUS.IN_REVIEW, {
        submittedBy: userTag,
        discordUserId: userId
    });

    if (!result.success) {
        return { success: false, error: result.error || 'Unknown error' };
    }

    const reviewForum = guild.channels.cache.get(config.channels.tasksForReview);

    if (reviewForum && reviewForum.type === ChannelType.GuildForum) {
        const thread = await createReviewThread(reviewForum, {
            ticketKey,
            summary: result.summary,
            userId,
            userTag
        });

        if (thread) {
            await thread.send({
                content: `<@&${config.roles.pm}> New task ready for review!`,
                allowedMentions: { roles: [config.roles.pm] }
            });
        }
    }

    return { success: true, summary: result.summary };
}

/**
 * Create a review thread in the tasks-for-review forum
 * @private
 */
async function createReviewThread(forum, { ticketKey, summary, userId, userTag }) {
    try {
        const thread = await forum.threads.create({
            name: `${ticketKey}: ${summary || 'Review Request'}`,
            message: {
                embeds: [{
                    title: `📋 ${ticketKey}: ${summary || 'Task'}`,
                    url: `${config.jiraBaseUrl}/browse/${ticketKey}`,
                    description: `Submitted for review by <@${userId}>`,
                    color: COLORS.IN_REVIEW,
                    fields: [
                        { name: 'Status', value: JIRA_STATUS.IN_REVIEW, inline: true },
                        { name: 'Submitted By', value: userTag, inline: true }
                    ],
                    footer: { text: 'React with ✅ to approve | React with ❌ to deny' },
                    timestamp: new Date().toISOString()
                }]
            }
        });

        const starterMessage = await thread.fetchStarterMessage();
        if (starterMessage) {
            await starterMessage.react('✅');
            await starterMessage.react('❌');
        }

        return thread;
    } catch (error) {
        logger.error('Error creating review thread:', error);
        return null;
    }
}

/**
 * Mark a ticket as done (PM action)
 * @param {Object} params
 * @param {string} params.ticketKey - Jira ticket key
 * @param {string} params.approverTag - PM's Discord tag
 * @param {import('discord.js').User} params.approver - PM's Discord user
 * @param {import('discord.js').Guild} params.guild - Discord guild
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function markAsDone({ ticketKey, approverTag, approver, guild }) {
    const result = await n8nService.moveTicket(ticketKey, JIRA_STATUS.DONE, {
        approvedBy: approverTag
    });

    if (!result.success) {
        return { success: false, error: result.error || 'Unknown error' };
    }

    const { discordUserId, discordUser } = await userLookupService.lookupDiscordUser(
        guild,
        result.assignee?.emailAddress
    );

    await deleteWorkingThread(guild, discordUserId, discordUser, ticketKey,
        'Task completed - moved to completed tasks');

    await deleteReviewThread(guild, ticketKey, 'Task approved - moved to completed tasks');

    await forumService.createCompletedTaskThread(guild, ticketKey, result, approver);

    return { success: true };
}

/**
 * Deny a ticket review (PM action)
 * @param {Object} params
 * @param {string} params.ticketKey - Jira ticket key
 * @param {string} params.reason - Denial reason
 * @param {string} params.denierTag - PM's Discord tag
 * @param {string} params.denierId - PM's Discord user ID
 * @param {import('discord.js').Guild} params.guild - Discord guild
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function denyReview({ ticketKey, reason, denierTag, denierId, guild }) {
    const result = await n8nService.moveTicket(ticketKey, JIRA_STATUS.IN_PROGRESS, {
        deniedBy: denierTag
    });

    if (!result.success) {
        return { success: false, error: result.error || 'Unknown error' };
    }

    const { discordUserId, discordUser } = await userLookupService.lookupDiscordUser(
        guild,
        result.assignee?.emailAddress
    );

    await deleteReviewThread(guild, ticketKey, 'Review denied - feedback sent to working thread');

    await notifyInWorkingThread(guild, discordUserId, discordUser, ticketKey, {
        type: 'denial',
        reason,
        denierId
    });

    return { success: true };
}

/**
 * Quit/unassign from a ticket
 * @param {Object} params
 * @param {string} params.ticketKey - Jira ticket key
 * @param {string} params.userId - Discord user ID
 * @param {string} params.username - Discord username
 * @param {import('discord.js').Guild} params.guild - Discord guild
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function quitTicket({ ticketKey, userId, username, guild }) {
    const result = await n8nService.quitTicket(ticketKey, userId, username);

    if (!result.success) {
        return { success: false, error: result.error || 'Unknown error' };
    }

    await archiveWorkingThread(guild, username, ticketKey, userId);

    return { success: true };
}

// ============================================================================
// Private Helper Functions
// ============================================================================

/**
 * Delete thread in user's working tickets forum
 * @private
 */
async function deleteWorkingThread(guild, discordUserId, discordUser, ticketKey, reason) {
    const workingCategory = guild.channels.cache.get(config.categories.workingTickets);
    if (!workingCategory) return;

    const { userForum, ticketThread: foundThread } = await userLookupService.findUserForum(
        workingCategory,
        discordUserId,
        discordUser,
        ticketKey
    );

    let ticketThread = foundThread;
    if (userForum && !ticketThread) {
        ticketThread = await threadService.findTicketThread(userForum, ticketKey);
    }

    if (ticketThread) {
        threadService.deleteThreadWithDelay(ticketThread, reason, TIMEOUTS.THREAD_DELETE_SHORT);
    }
}

/**
 * Delete thread in tasks-for-review forum
 * @private
 */
async function deleteReviewThread(guild, ticketKey, reason) {
    const reviewForum = guild.channels.cache.get(config.channels.tasksForReview);
    if (!reviewForum || reviewForum.type !== ChannelType.GuildForum) return;

    const reviewThread = await threadService.findTicketThread(reviewForum, ticketKey);
    if (reviewThread) {
        threadService.deleteThreadWithDelay(reviewThread, reason, TIMEOUTS.THREAD_DELETE_MEDIUM);
    }
}

/**
 * Send notification message to user's working thread
 * @private
 */
async function notifyInWorkingThread(guild, discordUserId, discordUser, ticketKey, notification) {
    const workingCategory = guild.channels.cache.get(config.categories.workingTickets);
    if (!workingCategory) return;

    const { userForum, ticketThread: foundThread } = await userLookupService.findUserForum(
        workingCategory,
        discordUserId,
        discordUser,
        ticketKey
    );

    let ticketThread = foundThread;
    if (userForum && !ticketThread) {
        ticketThread = await threadService.findTicketThread(userForum, ticketKey);
    }

    if (!ticketThread) return;

    if (ticketThread.archived) {
        await threadService.unarchiveThread(ticketThread);
    }

    if (notification.type === 'denial') {
        const assigneePing = discordUserId ? `<@${discordUserId}> - ` : '';
        await ticketThread.send({
            content: `${assigneePing}⚠️ **Review Denied** by <@${notification.denierId}>.\n` +
                `**Reason:** ${notification.reason}\n\n` +
                `Please address the feedback and use \`/task review ${ticketKey}\` when ready to resubmit.`
        });
        logger.debug(`Posted denial message to working thread for ${ticketKey}`);
    }
}

/**
 * Archive thread when user quits a ticket
 * @private
 */
async function archiveWorkingThread(guild, username, ticketKey, userId) {
    const workingCategory = guild.channels.cache.get(config.categories.workingTickets);
    if (!workingCategory) return;

    const forumName = `tasks-${username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const taskForum = workingCategory.children?.cache.find(
        ch => ch.name === forumName && ch.type === ChannelType.GuildForum
    );

    if (!taskForum) return;

    const ticketThread = await threadService.findTicketThread(taskForum, ticketKey);
    if (ticketThread) {
        await ticketThread.send({
            content: `🚪 Task unassigned by <@${userId}>. Ticket moved back to **${JIRA_STATUS.TO_DO}**.`
        });
        threadService.archiveThreadWithDelay(ticketThread, TIMEOUTS.THREAD_DELETE_SHORT);
    }
}

/**
 * Check if a guild member has the PM role
 * @param {import('discord.js').Guild} guild - Discord guild
 * @param {string} userId - Discord user ID
 * @returns {Promise<boolean>}
 */
async function hasPmRole(guild, userId) {
    try {
        const member = await guild.members.fetch(userId);
        return member.roles.cache.has(config.roles.pm);
    } catch (error) {
        logger.error('Error checking PM role:', error);
        return false;
    }
}

module.exports = {
    submitForReview,
    markAsDone,
    denyReview,
    quitTicket,
    hasPmRole
};
