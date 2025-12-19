/**
 * n8n Webhook Client Service
 *
 * Centralized service for all n8n webhook calls with retry logic,
 * request/response logging, and standardized error handling.
 */

const config = require('../config');
const { createLogger } = require('../utils/logger');

const logger = createLogger('N8nService');

// Retry configuration
const RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelayMs: 1000  // 1 second, doubles each retry (1s, 2s, 4s)
};

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute an async operation with retry logic and exponential backoff
 * @param {Function} operation - Async function to execute
 * @param {string} operationName - Name for logging
 * @returns {Promise<Object>} Result object with success, data, and optional error
 */
async function withRetry(operation, operationName) {
    let lastError;

    for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
        try {
            const result = await operation();
            return result;
        } catch (error) {
            lastError = error;

            if (attempt < RETRY_CONFIG.maxAttempts) {
                const delay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1);
                logger.warn(
                    `${operationName} attempt ${attempt}/${RETRY_CONFIG.maxAttempts} failed: ${error.message}. ` +
                    `Retrying in ${delay}ms...`
                );
                await sleep(delay);
            }
        }
    }

    logger.error(`${operationName} failed after ${RETRY_CONFIG.maxAttempts} attempts: ${lastError.message}`);
    return {
        success: false,
        error: `Request failed after ${RETRY_CONFIG.maxAttempts} attempts: ${lastError.message}`
    };
}

/**
 * Execute an HTTP request with logging and standardized response handling
 * @param {string} method - HTTP method (GET, POST, DELETE)
 * @param {string} endpoint - Webhook endpoint path
 * @param {Object} options - Request options
 * @param {Object} [options.body] - Request body (for POST/DELETE)
 * @param {Object} [options.queryParams] - Query parameters (for GET)
 * @returns {Promise<Object>} Standardized response { success, ...data } or { success: false, error }
 */
async function executeRequest(method, endpoint, options = {}) {
    const { body, queryParams } = options;
    const operationName = `${method} ${endpoint}`;

    return withRetry(async () => {
        // Build URL with query params if present
        let url = `${config.n8nBaseUrl}${endpoint}`;
        if (queryParams && Object.keys(queryParams).length > 0) {
            const params = new URLSearchParams(queryParams);
            url += `?${params.toString()}`;
        }

        const startTime = Date.now();

        // Log request
        logger.debug(`Request: ${method} ${endpoint}`, {
            ...(body && { body }),
            ...(queryParams && { queryParams })
        });

        // Build fetch options
        const fetchOptions = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };

        if (body && (method === 'POST' || method === 'DELETE')) {
            fetchOptions.body = JSON.stringify(body);
        }

        // Execute request
        const response = await fetch(url, fetchOptions);
        const duration = Date.now() - startTime;

        // Parse response
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            logger.error(`Response parse error for ${operationName}`, {
                status: response.status,
                duration: `${duration}ms`,
                error: parseError.message
            });
            throw new Error(`Failed to parse response: ${parseError.message}`);
        }

        // Log response
        if (response.ok) {
            logger.debug(`Response: ${method} ${endpoint}`, {
                status: response.status,
                duration: `${duration}ms`,
                success: data.success
            });
        } else {
            logger.warn(`Response error: ${method} ${endpoint}`, {
                status: response.status,
                duration: `${duration}ms`,
                error: data.error || 'Unknown error'
            });
        }

        // Handle non-2xx responses
        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        // Return standardized response with data spread at top level for backward compatibility
        return {
            success: data.success !== false,
            ...data
        };
    }, operationName);
}

// =============================================================================
// Service Methods
// =============================================================================

/**
 * Assign a Jira ticket to a Discord user
 * @param {string} discordUserId - Discord user ID
 * @param {string} discordUsername - Discord username
 * @param {string} discordTag - Discord tag (e.g., username#1234)
 * @param {string} jiraTicketKey - Jira ticket key (e.g., KAN-123)
 * @param {string} threadId - Discord thread ID
 * @returns {Promise<Object>} { success, ...responseData }
 */
async function assignTicket(discordUserId, discordUsername, discordTag, jiraTicketKey, threadId) {
    return executeRequest('POST', config.webhooks.assignTicket, {
        body: {
            discordUserId,
            discordUsername,
            discordTag,
            jiraTicketKey,
            threadId,
            action: 'claim'
        }
    });
}

/**
 * Move a Jira ticket to a new status
 * @param {string} jiraTicketKey - Jira ticket key (e.g., KAN-123)
 * @param {string} targetStatus - Target Jira status
 * @param {Object} options - Additional options
 * @param {string} [options.approvedBy] - Who approved (for Done status)
 * @param {string} [options.deniedBy] - Who denied (for In Progress from review)
 * @param {string} [options.submittedBy] - Who submitted (for In Review)
 * @param {string} [options.discordUserId] - Discord user ID of submitter
 * @returns {Promise<Object>} { success, ...responseData }
 */
async function moveTicket(jiraTicketKey, targetStatus, options = {}) {
    const { approvedBy, deniedBy, submittedBy, discordUserId } = options;

    return executeRequest('POST', config.webhooks.moveTicket, {
        body: {
            jiraTicketKey,
            targetStatus,
            ...(approvedBy && { approvedBy }),
            ...(deniedBy && { deniedBy }),
            ...(submittedBy && { submittedBy }),
            ...(discordUserId && { discordUserId })
        }
    });
}

/**
 * Register a Discord user with their Jira email
 * @param {string} discordId - Discord user ID
 * @param {string} discordUsername - Discord username
 * @param {string} jiraEmail - Jira email address
 * @returns {Promise<Object>} { success, ...responseData }
 */
async function registerUser(discordId, discordUsername, jiraEmail) {
    return executeRequest('POST', config.webhooks.registerUser, {
        body: {
            discordUserId: discordId,
            discordUsername,
            jiraEmail,
            registeredAt: new Date().toISOString()
        }
    });
}

/**
 * Unregister a Discord user from Jira
 * @param {string} discordId - Discord user ID
 * @returns {Promise<Object>} { success, ...responseData }
 */
async function unregisterUser(discordId) {
    return executeRequest('DELETE', config.webhooks.registerUser, {
        body: {
            discordUserId: discordId,
            action: 'unregister'
        }
    });
}

/**
 * Look up a Discord user by their Jira email
 * @param {string} jiraEmail - Jira email address
 * @returns {Promise<Object>} { success, discordId?, ...responseData }
 */
async function lookupUser(jiraEmail) {
    return executeRequest('POST', config.webhooks.lookupUser, {
        body: { jiraEmail }
    });
}

/**
 * Look up a user's registration by Discord ID (for whoami command)
 * @param {string} discordUserId - Discord user ID
 * @returns {Promise<Object>} { success, jiraEmail?, registeredAt?, ...responseData }
 */
async function lookupUserByDiscordId(discordUserId) {
    return executeRequest('POST', config.webhooks.lookupUser, {
        body: {
            discordUserId
        }
    });
}

/**
 * Unassign a user from a Jira ticket
 * @param {string} jiraTicketKey - Jira ticket key (e.g., KAN-123)
 * @param {string} discordId - Discord user ID
 * @param {string} discordUsername - Discord username
 * @returns {Promise<Object>} { success, ...responseData }
 */
async function quitTicket(jiraTicketKey, discordId, discordUsername) {
    return executeRequest('POST', config.webhooks.quitTicket, {
        body: {
            jiraTicketKey,
            discordUserId: discordId,
            discordUsername
        }
    });
}

/**
 * Get tasks assigned to a Discord user
 * @param {string} discordUserId - Discord user ID
 * @param {string} [statusFilter] - Optional status filter (todo, inprogress, inreview, done)
 * @returns {Promise<Object>} { success, tasks?, ...responseData }
 */
async function getUserTasks(discordUserId, statusFilter = null) {
    const queryParams = { discordUserId };
    if (statusFilter) {
        queryParams.status = statusFilter;
    }

    return executeRequest('GET', config.webhooks.getUserTasks, {
        queryParams
    });
}

module.exports = {
    assignTicket,
    moveTicket,
    registerUser,
    unregisterUser,
    lookupUser,
    lookupUserByDiscordId,
    quitTicket,
    getUserTasks
};
