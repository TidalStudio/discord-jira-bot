/**
 * Custom error types for ticket handler operations.
 * Provides structured error handling with context for logging and user feedback.
 */

/**
 * Base error for ticket operations
 * @extends Error
 */
class TicketError extends Error {
    /**
     * @param {string} message - Error message
     * @param {string|null} ticketKey - Jira ticket key (e.g., "KAN-123")
     */
    constructor(message, ticketKey = null) {
        super(message);
        this.name = 'TicketError';
        this.ticketKey = ticketKey;
    }
}

/**
 * User lacks required role/permission
 * @extends TicketError
 */
class PermissionError extends TicketError {
    /**
     * @param {string} message - Error message
     * @param {string|null} requiredRole - The role that was required
     */
    constructor(message, requiredRole = null) {
        super(message);
        this.name = 'PermissionError';
        this.requiredRole = requiredRole;
    }
}

/**
 * n8n webhook call failed
 * @extends TicketError
 */
class WebhookError extends TicketError {
    /**
     * @param {string} message - Error message
     * @param {string|null} ticketKey - Jira ticket key
     * @param {string|null} endpoint - The webhook endpoint that failed
     */
    constructor(message, ticketKey = null, endpoint = null) {
        super(message, ticketKey);
        this.name = 'WebhookError';
        this.endpoint = endpoint;
    }
}

module.exports = { TicketError, PermissionError, WebhookError };
