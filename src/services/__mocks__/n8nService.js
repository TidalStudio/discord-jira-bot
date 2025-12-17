/**
 * Manual mock for n8nService
 * Provides mock implementations for all n8n webhook methods
 */

const assignTicket = jest.fn().mockResolvedValue({
  success: true,
  ticketKey: 'KAN-123',
  assignedTo: 'testuser'
});

const moveTicket = jest.fn().mockResolvedValue({
  success: true,
  ticketKey: 'KAN-123',
  newStatus: 'In Progress'
});

const registerUser = jest.fn().mockResolvedValue({
  success: true,
  discordId: 'user-123',
  jiraEmail: 'user@example.com'
});

const unregisterUser = jest.fn().mockResolvedValue({
  success: true,
  discordId: 'user-123'
});

const lookupUser = jest.fn().mockResolvedValue({
  success: true,
  discordId: 'user-123',
  jiraEmail: 'user@example.com'
});

const lookupUserByDiscordId = jest.fn().mockResolvedValue({
  success: true,
  jiraEmail: 'user@example.com',
  registeredAt: '2024-01-01T00:00:00Z'
});

const quitTicket = jest.fn().mockResolvedValue({
  success: true,
  ticketKey: 'KAN-123'
});

const getUserTasks = jest.fn().mockResolvedValue({
  success: true,
  tasks: [
    { key: 'KAN-123', summary: 'Test Task', status: 'In Progress' }
  ]
});

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
