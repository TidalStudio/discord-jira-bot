/**
 * Manual mock for config module
 * Provides test configuration values without requiring environment variables
 */

const config = {
  token: 'mock-discord-token',
  clientId: 'mock-client-id',
  guildId: 'mock-guild-id',
  n8nBaseUrl: 'https://n8n.example.com',
  jiraBaseUrl: 'https://jira.example.com',
  webhooks: {
    assignTicket: '/webhook/assign-ticket',
    registerUser: '/webhook/register-user',
    moveTicket: '/webhook/move-ticket',
    lookupUser: '/webhook/lookup-user',
    quitTicket: '/webhook/quit-ticket',
    getUserTasks: '/webhook/get-user-tasks'
  },
  channels: {
    codeUnassigned: 'channel-code-unassigned',
    artUnassigned: 'channel-art-unassigned',
    audioUnassigned: 'channel-audio-unassigned',
    tasksForReview: 'channel-tasks-for-review',
    ticketNotifs: 'channel-ticket-notifs'
  },
  categories: {
    workingTickets: 'category-working-tickets',
    completedTasks: 'category-completed-tasks'
  },
  roles: {
    pm: 'role-pm'
  }
};

module.exports = config;
