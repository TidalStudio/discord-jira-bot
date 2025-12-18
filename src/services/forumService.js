/**
 * Forum Service
 *
 * Consolidates forum creation and thread posting operations.
 * Handles user task forums (private) and completed task forums.
 */

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { parseJiraDescription } = require('./jiraParserService');
const { createLogger } = require('../utils/logger');
const { JIRA_STATUS, COLORS, FORUM } = require('../utils/constants');

const logger = createLogger('ForumService');

/**
 * Find or create a user's private task forum in a category
 * @param {import('discord.js').Guild} guild - Discord guild
 * @param {import('discord.js').User} user - Discord user
 * @param {string} categoryId - Category ID to create forum in
 * @param {import('discord.js').Client} client - Discord client (for bot permissions)
 * @returns {Promise<import('discord.js').ForumChannel|null>}
 */
async function findOrCreateUserTaskForum(guild, user, categoryId, client) {
    const forumName = `tasks-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    // Look for existing forum channel in the category
    const category = guild.channels.cache.get(categoryId);
    let taskForum = null;

    if (category) {
        taskForum = category.children?.cache.find(
            ch => ch.name === forumName && ch.type === ChannelType.GuildForum
        );
    }

    // Create forum if doesn't exist
    if (!taskForum) {
        try {
            taskForum = await guild.channels.create({
                name: forumName,
                type: ChannelType.GuildForum,
                parent: categoryId,
                topic: `Personal task board for ${user.username}`,
                permissionOverwrites: [
                    {
                        id: guild.id, // @everyone
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                    },
                    {
                        id: client.user.id, // Bot
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageThreads]
                    }
                ]
            });

            logger.info(`Created private task forum for ${user.tag}`);
        } catch (error) {
            logger.error('Error creating task forum:', error);
            return null;
        }
    }

    return taskForum;
}

/**
 * Create a task thread in a forum
 * @param {import('discord.js').ForumChannel} forum - Forum to create thread in
 * @param {Object} ticketData - Ticket data
 * @param {string} ticketData.ticketKey - Jira ticket key (e.g., "KAN-123")
 * @param {string} ticketData.title - Ticket title
 * @param {string} ticketData.description - Jira description (HTML/markup)
 * @param {string} ticketData.priority - Jira priority
 * @param {string|string[]} ticketData.labels - Jira labels
 * @param {string} ticketData.userId - Discord user ID for mention
 * @returns {Promise<import('discord.js').ThreadChannel|null>}
 */
async function createTaskThread(forum, ticketData) {
    const { ticketKey, title, description, priority, labels, userId } = ticketData;

    try {
        const cleanTitle = title.replace(/^[A-Z]+-\d+:\s*/, '');

        // Build embed fields
        const embedFields = [
            { name: 'Status', value: JIRA_STATUS.IN_PROGRESS, inline: true },
            { name: 'Priority', value: priority || 'None', inline: true },
            { name: 'Assigned To', value: `<@${userId}>`, inline: true }
        ];

        // Add labels if present
        if (labels && labels.length > 0) {
            const labelStr = Array.isArray(labels) ? labels.join(', ') : labels;
            embedFields.push({ name: 'Labels', value: labelStr, inline: true });
        }

        // Create thread with embed
        const thread = await forum.threads.create({
            name: `${ticketKey}: ${cleanTitle}`,
            message: {
                embeds: [{
                    title: `${ticketKey}: ${cleanTitle}`,
                    url: `${config.jiraBaseUrl}/browse/${ticketKey}`,
                    color: COLORS.SUCCESS,
                    fields: embedFields,
                    footer: { text: 'Use /task review to submit for PM review' },
                    timestamp: new Date().toISOString()
                }]
            }
        });

        // Add clipboard reaction to starter message for easy review submission
        try {
            const starterMessage = await thread.fetchStarterMessage();
            if (starterMessage) {
                await starterMessage.react('📋');
            }
        } catch (error) {
            logger.debug(`Could not add clipboard reaction: ${error.message}`);
        }

        // Post description as separate message
        let descriptionText = 'No description provided.';
        if (description) {
            descriptionText = parseJiraDescription(description);
        }

        // Truncate if too long for Discord message
        if (descriptionText.length > 1900) {
            descriptionText = descriptionText.substring(0, 1900) + '\n\n*[View full description in Jira]*';
        }

        await thread.send({ content: descriptionText });

        logger.info(`Created task thread ${ticketKey} for user ${userId}`);
        return thread;
    } catch (error) {
        logger.error('Error creating task thread:', error);
        return null;
    }
}

/**
 * Create a completed task thread in the Completed Tasks category
 * @param {import('discord.js').Guild} guild - Discord guild
 * @param {string} ticketKey - Jira ticket key
 * @param {Object} ticketInfo - Ticket info from n8n
 * @param {string} ticketInfo.summary - Ticket summary
 * @param {Object} ticketInfo.assignee - Assignee info
 * @param {import('discord.js').User} approver - User who approved the task
 * @returns {Promise<import('discord.js').ThreadChannel|null>}
 */
async function createCompletedTaskThread(guild, ticketKey, ticketInfo, approver) {
    try {
        logger.debug(`Creating completed task thread for ${ticketKey}...`);

        const assigneeName = ticketInfo.assignee?.displayName || ticketInfo.assignee?.name || 'Unassigned';
        const forumName = `tasks-${assigneeName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

        logger.debug(`Assignee: ${assigneeName}, Forum name: ${forumName}`);

        // Look for existing forum channel in the completed tasks category
        const completedCategory = guild.channels.cache.get(config.categories.completedTasks);
        let userForum = null;

        if (completedCategory) {
            userForum = completedCategory.children?.cache.find(
                ch => ch.name === forumName && ch.type === ChannelType.GuildForum
            );
        }

        // Create forum if doesn't exist
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
                logger.info(`Created completed tasks forum: ${forumName} (ID: ${userForum.id})`);
            } catch (error) {
                logger.error('Error creating completed tasks forum:', error);
                return null;
            }
        } else {
            logger.debug(`Found existing completed tasks forum: ${forumName}`);
        }

        // Create thread for the completed task
        const thread = await userForum.threads.create({
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

        logger.info(`Created completed task thread for ${ticketKey} in ${forumName}`);
        return thread;
    } catch (error) {
        logger.error('Error creating completed task thread:', error);
        logger.error('Error stack:', error.stack);
        return null;
    }
}

module.exports = {
    findOrCreateUserTaskForum,
    createTaskThread,
    createCompletedTaskThread
};
