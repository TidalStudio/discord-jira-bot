/**
 * User Lookup Service
 *
 * Consolidates user lookup logic with a 3-tier strategy for finding user forums.
 * Eliminates duplicated code from index.js and task.js handlers.
 */

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const n8nService = require('./n8nService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('UserLookupService');

/**
 * Look up Discord user from Jira email via n8n webhook
 * @param {import('discord.js').Guild} guild - Discord guild
 * @param {string|null|undefined} jiraEmail - Jira user email
 * @returns {Promise<{discordUserId: string|null, discordUser: import('discord.js').GuildMember|null}>}
 */
async function lookupDiscordUser(guild, jiraEmail) {
    let discordUser = null;
    let discordUserId = null;

    if (!jiraEmail) {
        logger.debug('No email address provided for Discord user lookup');
        return { discordUserId, discordUser };
    }

    try {
        const lookupResult = await n8nService.lookupUser(jiraEmail);
        logger.debug(`Lookup result for ${jiraEmail}:`, JSON.stringify(lookupResult, null, 2));

        if (lookupResult.discordId) {
            discordUserId = lookupResult.discordId;
            discordUser = await guild.members.fetch(discordUserId).catch((e) => {
                logger.debug(`Could not fetch Discord member ${discordUserId}:`, e.message);
                return null;
            });
        }
    } catch (e) {
        logger.debug('Could not lookup Discord user from Jira email:', e.message);
    }

    return { discordUserId, discordUser };
}

/**
 * Find user's forum using 3-tier lookup strategy
 *
 * Tier 1: Find forum by Discord username (tasks-{username})
 * Tier 2: Find forum where user has ViewChannel permission
 * Tier 3: Search all forums for thread starting with ticket key (last resort)
 *
 * @param {import('discord.js').CategoryChannel} category - Working tickets category
 * @param {string|null} discordUserId - Discord user ID (may be null)
 * @param {import('discord.js').GuildMember|null} discordUser - Discord member (may be null)
 * @param {string} ticketKey - Jira ticket key for Tier 3 fallback
 * @returns {Promise<{userForum: import('discord.js').ForumChannel|null, ticketThread: import('discord.js').ThreadChannel|null}>}
 */
async function findUserForum(category, discordUserId, discordUser, ticketKey) {
    let userForum = null;
    let ticketThread = null;

    if (!category) {
        logger.debug('No category provided for forum lookup');
        return { userForum, ticketThread };
    }

    // Tier 1: Find forum by Discord username
    if (discordUser) {
        const forumName = `tasks-${discordUser.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        logger.debug(`Tier 1: Looking for forum by username: ${forumName}`);
        userForum = category.children?.cache.find(
            ch => ch.name === forumName && ch.type === ChannelType.GuildForum
        );
        if (userForum) {
            logger.debug(`Tier 1 success: Found forum ${userForum.name}`);
        }
    }

    // Tier 2: Find forum by permission overwrites (user has ViewChannel permission)
    if (!userForum && discordUserId) {
        logger.debug(`Tier 2: Trying permission-based lookup for user ID: ${discordUserId}`);
        userForum = category.children?.cache.find(ch => {
            if (ch.type !== ChannelType.GuildForum) return false;
            const perms = ch.permissionOverwrites.cache.get(discordUserId);
            return perms && perms.allow.has(PermissionFlagsBits.ViewChannel);
        });
        if (userForum) {
            logger.debug(`Tier 2 success: Found forum via permissions: ${userForum.name}`);
        }
    }

    // Tier 3: Search ALL forums for thread with this ticket key (last resort)
    if (!userForum) {
        logger.debug(`Tier 3: Searching all forums for ticket thread: ${ticketKey}`);
        const allForums = category.children?.cache.filter(ch => ch.type === ChannelType.GuildForum);

        for (const [, forum] of allForums) {
            try {
                const activeThreads = await forum.threads.fetchActive();
                const archivedThreads = await forum.threads.fetchArchived();

                ticketThread = activeThreads.threads.find(t => t.name.startsWith(ticketKey));
                if (!ticketThread) {
                    ticketThread = archivedThreads.threads.find(t => t.name.startsWith(ticketKey));
                }

                if (ticketThread) {
                    userForum = forum;
                    logger.debug(`Tier 3 success: Found ticket thread in forum: ${forum.name}`);
                    break;
                }
            } catch (e) {
                logger.debug(`Error searching forum ${forum.name}:`, e.message);
            }
        }
    }

    return { userForum, ticketThread };
}

/**
 * Find ticket thread within a forum (searches both active and archived)
 * @param {import('discord.js').ForumChannel} forum - Forum to search
 * @param {string} ticketKey - Jira ticket key
 * @returns {Promise<import('discord.js').ThreadChannel|null>}
 */
async function findTicketThread(forum, ticketKey) {
    if (!forum) {
        return null;
    }

    try {
        const activeThreads = await forum.threads.fetchActive();
        let ticketThread = activeThreads.threads.find(t => t.name.startsWith(ticketKey));

        if (!ticketThread) {
            const archivedThreads = await forum.threads.fetchArchived();
            ticketThread = archivedThreads.threads.find(t => t.name.startsWith(ticketKey));
        }

        return ticketThread || null;
    } catch (e) {
        logger.debug(`Error finding ticket thread ${ticketKey} in forum ${forum.name}:`, e.message);
        return null;
    }
}

module.exports = {
    lookupDiscordUser,
    findUserForum,
    findTicketThread
};
