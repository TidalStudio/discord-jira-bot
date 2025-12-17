/**
 * Reaction Handler
 *
 * Handles Discord reaction events for ticket workflows.
 * Routes reactions to appropriate ticket handlers (claim, approve, deny).
 */

const { ChannelType } = require('discord.js');
const { createLogger } = require('../utils/logger');
const { EMOJIS } = require('../utils/constants');
const { extractTicketKey } = require('../utils/validators');
const { handleClaimTicket, handleApproveTicket, handleDenyTicket } = require('./ticketHandlers');

const logger = createLogger('ReactionHandler');

/**
 * Main reaction event handler
 * Routes reactions to appropriate ticket handlers based on emoji and channel
 * @param {import('discord.js').MessageReaction} reaction - The reaction object
 * @param {import('discord.js').User} user - The user who reacted
 * @param {import('discord.js').Client} client - Discord client
 * @param {Object} config - Bot configuration
 */
async function handleReaction(reaction, user, client, config) {
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
        await handleClaimTicket(reaction, user, jiraTicketKey, channel, config);
    } else if (parentId === config.channels.tasksForReview) {
        if (isCheckmark) {
            // PM is approving a ticket
            await handleApproveTicket(reaction, user, jiraTicketKey, channel, config);
        } else if (isDeny) {
            // PM is denying a ticket
            await handleDenyTicket(reaction, user, jiraTicketKey, channel, config);
        }
    }
}

module.exports = { handleReaction };
