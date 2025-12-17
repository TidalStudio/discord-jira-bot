const { createLogger } = require('./utils/logger');

const logger = createLogger('Config');

// Define which env vars are required
const REQUIRED_ENV_VARS = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_GUILD_ID'
];

/**
 * Validate required environment variables exist
 * Exits process with helpful error message if any are missing
 */
function validateConfig() {
    const missing = REQUIRED_ENV_VARS.filter(key => !process.env[key]);
    if (missing.length > 0) {
        logger.error(`Missing required environment variables: ${missing.join(', ')}`);
        logger.error('Please check your .env file and ensure all required variables are set.');
        logger.error('See .env.example for reference.');
        process.exit(1);
    }
}

// Run validation before building config
validateConfig();

// Build config from environment variables
const config = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
    n8nBaseUrl: process.env.N8N_BASE_URL,
    jiraBaseUrl: process.env.JIRA_BASE_URL,
    webhooks: {
        assignTicket: '/webhook/assign-ticket',
        registerUser: '/webhook/register-user',
        moveTicket: '/webhook/move-ticket'
    },
    channels: {
        codeUnassigned: process.env.CHANNEL_CODE_UNASSIGNED,
        artUnassigned: process.env.CHANNEL_ART_UNASSIGNED,
        audioUnassigned: process.env.CHANNEL_AUDIO_UNASSIGNED,
        tasksForReview: process.env.CHANNEL_TASKS_FOR_REVIEW,
        ticketNotifs: process.env.CHANNEL_TICKET_NOTIFS
    },
    categories: {
        workingTickets: process.env.CATEGORY_WORKING_TICKETS,
        completedTasks: process.env.CATEGORY_COMPLETED_TASKS
    },
    roles: {
        pm: process.env.ROLE_PM
    }
};

// Export frozen object to prevent accidental mutation
module.exports = Object.freeze(config);
