/**
 * Reaction Lock Module
 *
 * Prevents duplicate processing of reactions by maintaining
 * an in-memory lock for ticket actions.
 */

const { TIMEOUTS } = require('../utils/constants');

// Map<compositeKey, timestamp>
// Key format: "ticketKey:action" e.g., "KAN-123:claim"
const processingLocks = new Map();

/**
 * Clean up locks older than the timeout threshold
 */
function cleanupStaleLocks() {
    const now = Date.now();
    for (const [key, timestamp] of processingLocks) {
        if (now - timestamp > TIMEOUTS.REACTION_LOCK) {
            processingLocks.delete(key);
        }
    }
}

/**
 * Attempt to acquire a lock for a ticket action
 * @param {string} ticketKey - Jira ticket key (e.g., "KAN-123")
 * @param {string} action - Action type: "claim", "approve", "deny", "review"
 * @returns {boolean} True if lock acquired, false if already locked
 */
function acquireLock(ticketKey, action) {
    const key = `${ticketKey}:${action}`;

    // Clean up stale locks first
    cleanupStaleLocks();

    if (processingLocks.has(key)) {
        return false;
    }

    processingLocks.set(key, Date.now());
    return true;
}

/**
 * Release a lock for a ticket action
 * @param {string} ticketKey - Jira ticket key
 * @param {string} action - Action type
 */
function releaseLock(ticketKey, action) {
    const key = `${ticketKey}:${action}`;
    processingLocks.delete(key);
}

/**
 * Check if a ticket action is currently locked
 * @param {string} ticketKey - Jira ticket key
 * @param {string} action - Action type
 * @returns {boolean} True if locked
 */
function isLocked(ticketKey, action) {
    const key = `${ticketKey}:${action}`;
    cleanupStaleLocks();
    return processingLocks.has(key);
}

module.exports = {
    acquireLock,
    releaseLock,
    isLocked
};
