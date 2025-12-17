/**
 * Centralized state for ticket-to-thread mapping.
 * Maps Jira ticket keys to Discord thread IDs.
 */
const ticketThreadMap = new Map();

module.exports = {
    ticketThreadMap
};
