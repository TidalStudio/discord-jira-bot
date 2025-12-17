/**
 * Formatters Utility
 *
 * Helper functions for status mapping - emoji, label, and color.
 * Extracted from tasks.js for reuse across commands.
 */

const { JIRA_STATUS, COLORS, STATUS_EMOJIS } = require('./constants');

/**
 * Get emoji for a Jira status
 * @param {string} status - Jira status string
 * @returns {string} Emoji character
 */
function getStatusEmoji(status) {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower.includes('done')) return STATUS_EMOJIS.DONE;
    if (statusLower.includes('review')) return STATUS_EMOJIS.IN_REVIEW;
    if (statusLower.includes('progress')) return STATUS_EMOJIS.IN_PROGRESS;
    if (statusLower.includes('to do')) return STATUS_EMOJIS.TO_DO;
    return STATUS_EMOJIS.DEFAULT;
}

/**
 * Convert status filter code to display label
 * @param {string} status - Status filter code (todo, inprogress, etc.)
 * @returns {string} Human-readable status label
 */
function getStatusLabel(status) {
    switch (status) {
        case 'todo': return JIRA_STATUS.TO_DO;
        case 'inprogress': return JIRA_STATUS.IN_PROGRESS;
        case 'inreview': return JIRA_STATUS.IN_REVIEW;
        case 'done': return JIRA_STATUS.DONE;
        default: return status;
    }
}

/**
 * Get embed color for a status filter
 * @param {string} status - Status filter code
 * @returns {number} Hex color value
 */
function getStatusColor(status) {
    switch (status) {
        case 'todo': return COLORS.TO_DO;
        case 'inprogress': return COLORS.IN_PROGRESS;
        case 'inreview': return COLORS.IN_REVIEW;
        case 'done': return COLORS.DONE;
        default: return COLORS.TO_DO;
    }
}

module.exports = {
    getStatusEmoji,
    getStatusLabel,
    getStatusColor
};
