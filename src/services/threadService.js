/**
 * Thread Service
 *
 * Consolidates thread search and management operations.
 * Handles finding ticket threads, deletion with delays, and archiving.
 */

const { createLogger } = require('../utils/logger');
const { TIMEOUTS } = require('../utils/constants');

const logger = createLogger('ThreadService');

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

/**
 * Delete a thread after a delay
 * @param {import('discord.js').ThreadChannel} thread - Thread to delete
 * @param {string} reason - Deletion reason
 * @param {number} [delayMs=TIMEOUTS.THREAD_DELETE_SHORT] - Delay before deletion in ms
 * @param {boolean} [fallbackToArchive=false] - If true, archive thread if delete fails
 */
function deleteThreadWithDelay(thread, reason, delayMs = TIMEOUTS.THREAD_DELETE_SHORT, fallbackToArchive = false) {
    if (!thread) {
        logger.debug('No thread provided to deleteThreadWithDelay');
        return;
    }

    setTimeout(async () => {
        try {
            await thread.delete(reason);
            logger.info(`Deleted thread ${thread.name}: ${reason}`);
        } catch (e) {
            logger.error(`Could not delete thread ${thread.name}:`, e.message);

            if (fallbackToArchive) {
                try {
                    await thread.setArchived(true);
                    logger.info(`Archived thread ${thread.name} as fallback`);
                } catch (e2) {
                    logger.error(`Could not archive thread ${thread.name} either:`, e2.message);
                }
            }
        }
    }, delayMs);
}

/**
 * Archive a thread
 * @param {import('discord.js').ThreadChannel} thread - Thread to archive
 * @returns {Promise<boolean>} - True if successful
 */
async function archiveThread(thread) {
    if (!thread) {
        logger.debug('No thread provided to archiveThread');
        return false;
    }

    try {
        await thread.setArchived(true);
        logger.info(`Archived thread ${thread.name}`);
        return true;
    } catch (e) {
        logger.error(`Could not archive thread ${thread.name}:`, e.message);
        return false;
    }
}

/**
 * Archive a thread after a delay
 * @param {import('discord.js').ThreadChannel} thread - Thread to archive
 * @param {number} [delayMs=TIMEOUTS.THREAD_DELETE_SHORT] - Delay before archiving in ms
 */
function archiveThreadWithDelay(thread, delayMs = TIMEOUTS.THREAD_DELETE_SHORT) {
    if (!thread) {
        logger.debug('No thread provided to archiveThreadWithDelay');
        return;
    }

    setTimeout(async () => {
        await archiveThread(thread);
    }, delayMs);
}

/**
 * Unarchive a thread
 * @param {import('discord.js').ThreadChannel} thread - Thread to unarchive
 * @returns {Promise<boolean>} - True if successful
 */
async function unarchiveThread(thread) {
    if (!thread) {
        logger.debug('No thread provided to unarchiveThread');
        return false;
    }

    try {
        await thread.setArchived(false);
        logger.info(`Unarchived thread ${thread.name}`);
        return true;
    } catch (e) {
        logger.error(`Could not unarchive thread ${thread.name}:`, e.message);
        return false;
    }
}

module.exports = {
    findTicketThread,
    deleteThreadWithDelay,
    archiveThread,
    archiveThreadWithDelay,
    unarchiveThread
};
