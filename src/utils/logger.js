/**
 * Structured logging utility with levels, timestamps, and context support.
 *
 * Log levels are controlled by NODE_ENV and LOG_LEVEL environment variables:
 * - Production: defaults to 'info' level (hides debug messages)
 * - Development: defaults to 'debug' level (shows all messages)
 * - LOG_LEVEL env var can override: 'debug', 'info', 'warn', 'error'
 */

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

// Default to 'info' in production, 'debug' in development
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL] ??
    (process.env.NODE_ENV === 'production' ? LOG_LEVELS.info : LOG_LEVELS.debug);

function formatTimestamp() {
    return new Date().toISOString();
}

function log(level, context, message, ...args) {
    if (LOG_LEVELS[level] < currentLevel) return;

    const timestamp = formatTimestamp();
    const contextStr = context ? `[${context}]` : '';
    const prefix = `${timestamp} ${level.toUpperCase()} ${contextStr}`.trim();

    const consoleFn = level === 'error' ? console.error :
                      level === 'warn' ? console.warn : console.log;

    if (args.length > 0) {
        consoleFn(`${prefix} ${message}`, ...args);
    } else {
        consoleFn(`${prefix} ${message}`);
    }
}

/**
 * Create a logger instance with optional context.
 * @param {string} context - Context label for log messages (e.g., 'Bot', 'Register')
 * @returns {Object} Logger with debug, info, warn, error methods
 */
function createLogger(context = '') {
    return {
        debug: (msg, ...args) => log('debug', context, msg, ...args),
        info: (msg, ...args) => log('info', context, msg, ...args),
        warn: (msg, ...args) => log('warn', context, msg, ...args),
        error: (msg, ...args) => log('error', context, msg, ...args)
    };
}

// Default logger without context
const logger = createLogger();

module.exports = { logger, createLogger };
