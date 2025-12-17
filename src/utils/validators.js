/**
 * Input validation utilities
 */

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Jira ticket key patterns
const JIRA_TICKET_REGEX = /^[A-Z]+-\d+$/;
const JIRA_TICKET_EXTRACT_REGEX = /([A-Z]+-\d+)/;

/**
 * Validates an email address format
 * @param {string} email - The email to validate
 * @returns {boolean} - True if valid email format
 */
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return EMAIL_REGEX.test(email);
}

/**
 * Validates a Jira ticket key format (e.g., KAN-123)
 * @param {string} key - The ticket key to validate
 * @returns {boolean} - True if valid ticket key format
 */
function isValidTicketKey(key) {
    if (!key || typeof key !== 'string') return false;
    return JIRA_TICKET_REGEX.test(key);
}

/**
 * Extracts a Jira ticket key from text
 * @param {string} text - The text to extract from
 * @returns {string|null} - The extracted ticket key or null
 */
function extractTicketKey(text) {
    if (!text || typeof text !== 'string') return null;
    const match = text.match(JIRA_TICKET_EXTRACT_REGEX);
    return match ? match[1] : null;
}

module.exports = {
    isValidEmail,
    isValidTicketKey,
    extractTicketKey
};
