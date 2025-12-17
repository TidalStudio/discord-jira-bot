/**
 * Mock for forumService
 * Used by taskManagementService and ticketHandlers tests
 */

const findOrCreateUserTaskForum = jest.fn().mockResolvedValue({
  id: 'forum-123',
  name: 'tasks-testuser'
});

const createTaskThread = jest.fn().mockResolvedValue({
  id: 'thread-123',
  name: 'KAN-123: Test Task'
});

const createCompletedTaskThread = jest.fn().mockResolvedValue({
  id: 'completed-thread-123',
  name: 'KAN-123: Completed Task'
});

module.exports = {
  findOrCreateUserTaskForum,
  createTaskThread,
  createCompletedTaskThread
};
