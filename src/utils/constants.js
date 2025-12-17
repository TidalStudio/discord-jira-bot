/**
 * Centralized constants for the Discord bot
 * Consolidates magic values for maintainability
 */

// Reaction emojis for claiming/approving/denying tickets
const EMOJIS = {
    CHECKMARKS: ['✅', '☑️', '✔️', 'white_check_mark', 'ballot_box_with_check', 'heavy_check_mark'],
    DENY: ['❌', '✖️', '🚫', 'x', 'cross_mark', 'negative_squared_cross_mark']
};

// Jira workflow status strings
const JIRA_STATUS = {
    TO_DO: 'To Do',
    IN_PROGRESS: 'In Progress',
    IN_REVIEW: 'In Review',
    DONE: 'Done'
};

// Discord embed colors (hex values)
const COLORS = {
    TO_DO: 0x3498db,       // Blue
    IN_PROGRESS: 0xf39c12, // Orange
    IN_REVIEW: 0x9b59b6,   // Purple
    DONE: 0x2ecc71,        // Green
    SUCCESS: 0x00ff00      // Bright green (for in-progress task forums)
};

// Status display emojis for task lists
const STATUS_EMOJIS = {
    DONE: '✅',
    IN_REVIEW: '🔍',
    IN_PROGRESS: '🔄',
    TO_DO: '📋',
    DEFAULT: '📌'
};

// Timeout delays (milliseconds) for thread operations
const TIMEOUTS = {
    THREAD_DELETE_SHORT: 2000,
    THREAD_DELETE_MEDIUM: 2500,
    THREAD_DELETE_LONG: 3000
};

// Regex patterns for Jira ticket keys
const PATTERNS = {
    JIRA_TICKET: /^[A-Z]+-\d+$/,           // Validation (exact match)
    JIRA_TICKET_EXTRACT: /([A-Z]+-\d+)/    // Extraction (find in string)
};

// Forum channel settings
const FORUM = {
    AUTO_ARCHIVE_DURATION: 10080  // 7 days in minutes
};

module.exports = {
    EMOJIS,
    JIRA_STATUS,
    COLORS,
    STATUS_EMOJIS,
    TIMEOUTS,
    PATTERNS,
    FORUM
};
