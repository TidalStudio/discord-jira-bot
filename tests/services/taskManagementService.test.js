/**
 * Unit tests for taskManagementService
 * Tests task lifecycle operations: review, done, deny, quit
 */

jest.mock('../../src/services/n8nService');
jest.mock('../../src/services/userLookupService');
jest.mock('../../src/services/threadService');
jest.mock('../../src/services/forumService');
jest.mock('../../src/config', () => ({
  channels: {
    tasksForReview: 'review-forum-123'
  },
  categories: {
    workingTickets: 'working-category-123'
  },
  roles: {
    pm: 'pm-role-123'
  },
  jiraBaseUrl: 'https://jira.example.com'
}));
jest.mock('../../src/utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

const {
  ChannelType,
  createMockGuild,
  createMockForum,
  createMockCategory,
  createMockThread,
  createMockMember,
  createMockCollection
} = require('../../__mocks__/discord.js');

const n8nService = require('../../src/services/n8nService');
const userLookupService = require('../../src/services/userLookupService');
const threadService = require('../../src/services/threadService');
const forumService = require('../../src/services/forumService');

const {
  submitForReview,
  markAsDone,
  denyReview,
  quitTicket,
  hasPmRole
} = require('../../src/services/taskManagementService');

describe('taskManagementService', () => {
  let mockGuild;
  let mockReviewForum;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReviewForum = createMockForum({
      id: 'review-forum-123',
      name: 'tasks-for-review',
      type: ChannelType.GuildForum
    });

    mockGuild = createMockGuild({
      channels: [['review-forum-123', mockReviewForum]]
    });
  });

  describe('submitForReview', () => {
    test('should return error when n8n moveTicket fails', async () => {
      n8nService.moveTicket.mockResolvedValue({
        success: false,
        error: 'Ticket not found'
      });

      const result = await submitForReview({
        ticketKey: 'KAN-123',
        userId: 'user-123',
        userTag: 'testuser#1234',
        guild: mockGuild
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Ticket not found');
    });

    test('should move ticket to In Review status', async () => {
      n8nService.moveTicket.mockResolvedValue({
        success: true,
        summary: 'Test Task'
      });

      const result = await submitForReview({
        ticketKey: 'KAN-123',
        userId: 'user-123',
        userTag: 'testuser#1234',
        guild: mockGuild
      });

      expect(n8nService.moveTicket).toHaveBeenCalledWith(
        'KAN-123',
        'In Review',
        expect.objectContaining({
          submittedBy: 'testuser#1234',
          discordUserId: 'user-123'
        })
      );
      expect(result.success).toBe(true);
      expect(result.summary).toBe('Test Task');
    });

    test('should create review thread when review forum exists', async () => {
      n8nService.moveTicket.mockResolvedValue({
        success: true,
        summary: 'Test Task'
      });

      // Mock the thread creation
      const mockThread = createMockThread({ name: 'KAN-123: Test Task' });
      mockThread.fetchStarterMessage = jest.fn().mockResolvedValue({
        react: jest.fn().mockResolvedValue(undefined)
      });
      mockReviewForum.threads.create.mockResolvedValue(mockThread);

      await submitForReview({
        ticketKey: 'KAN-123',
        userId: 'user-123',
        userTag: 'testuser#1234',
        guild: mockGuild
      });

      expect(mockReviewForum.threads.create).toHaveBeenCalled();
      expect(mockThread.send).toHaveBeenCalled();
    });
  });

  describe('markAsDone', () => {
    test('should return error when n8n moveTicket fails', async () => {
      n8nService.moveTicket.mockResolvedValue({
        success: false,
        error: 'Permission denied'
      });

      const result = await markAsDone({
        ticketKey: 'KAN-123',
        approverTag: 'pm#1234',
        approver: { id: 'pm-user-123' },
        guild: mockGuild
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });

    test('should return Unknown error when error is not specified', async () => {
      n8nService.moveTicket.mockResolvedValue({
        success: false
      });

      const result = await markAsDone({
        ticketKey: 'KAN-123',
        approverTag: 'pm#1234',
        approver: { id: 'pm-user-123' },
        guild: mockGuild
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    test('should move ticket to Done and create completed thread', async () => {
      n8nService.moveTicket.mockResolvedValue({
        success: true,
        assignee: { emailAddress: 'user@example.com' }
      });
      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: 'user-123',
        discordUser: createMockMember({ id: 'user-123' })
      });
      userLookupService.findUserForum.mockResolvedValue({
        userForum: null,
        ticketThread: null
      });

      const result = await markAsDone({
        ticketKey: 'KAN-123',
        approverTag: 'pm#1234',
        approver: { id: 'pm-user-123' },
        guild: mockGuild
      });

      expect(n8nService.moveTicket).toHaveBeenCalledWith(
        'KAN-123',
        'Done',
        expect.objectContaining({ approvedBy: 'pm#1234' })
      );
      expect(forumService.createCompletedTaskThread).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    test('should delete working thread if found', async () => {
      const mockWorkingThread = createMockThread({ name: 'KAN-123: Test' });
      const mockWorkingForum = createMockForum({ id: 'forum-456' });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      n8nService.moveTicket.mockResolvedValue({
        success: true,
        assignee: { emailAddress: 'user@example.com' }
      });
      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: 'user-123',
        discordUser: createMockMember({ id: 'user-123' })
      });
      userLookupService.findUserForum.mockResolvedValue({
        userForum: mockWorkingForum,
        ticketThread: mockWorkingThread
      });

      await markAsDone({
        ticketKey: 'KAN-123',
        approverTag: 'pm#1234',
        approver: { id: 'pm-user-123' },
        guild: mockGuild
      });

      expect(threadService.deleteThreadWithDelay).toHaveBeenCalledWith(
        mockWorkingThread,
        expect.any(String),
        expect.any(Number)
      );
    });

    test('should find thread via threadService when forum found but not thread', async () => {
      const mockWorkingThread = createMockThread({ name: 'KAN-123: Test' });
      const mockWorkingForum = createMockForum({ id: 'forum-456' });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      n8nService.moveTicket.mockResolvedValue({
        success: true,
        assignee: { emailAddress: 'user@example.com' }
      });
      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: 'user-123',
        discordUser: createMockMember({ id: 'user-123' })
      });
      // Forum found but no thread from findUserForum
      userLookupService.findUserForum.mockResolvedValue({
        userForum: mockWorkingForum,
        ticketThread: null
      });
      // Thread found via threadService
      threadService.findTicketThread.mockResolvedValue(mockWorkingThread);

      await markAsDone({
        ticketKey: 'KAN-123',
        approverTag: 'pm#1234',
        approver: { id: 'pm-user-123' },
        guild: mockGuild
      });

      expect(threadService.findTicketThread).toHaveBeenCalledWith(mockWorkingForum, 'KAN-123');
      expect(threadService.deleteThreadWithDelay).toHaveBeenCalledWith(
        mockWorkingThread,
        expect.any(String),
        expect.any(Number)
      );
    });

    test('should delete review thread when review forum exists', async () => {
      const mockReviewThread = createMockThread({ name: 'KAN-123: Review' });

      n8nService.moveTicket.mockResolvedValue({
        success: true,
        assignee: { emailAddress: 'user@example.com' }
      });
      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: null,
        discordUser: null
      });
      userLookupService.findUserForum.mockResolvedValue({
        userForum: null,
        ticketThread: null
      });
      threadService.findTicketThread.mockResolvedValue(mockReviewThread);

      await markAsDone({
        ticketKey: 'KAN-123',
        approverTag: 'pm#1234',
        approver: { id: 'pm-user-123' },
        guild: mockGuild
      });

      // Should attempt to delete review thread
      expect(threadService.findTicketThread).toHaveBeenCalledWith(mockReviewForum, 'KAN-123');
    });
  });

  describe('denyReview', () => {
    test('should return error when n8n moveTicket fails', async () => {
      n8nService.moveTicket.mockResolvedValue({
        success: false,
        error: 'Service unavailable'
      });

      const result = await denyReview({
        ticketKey: 'KAN-123',
        reason: 'Needs more work',
        denierTag: 'pm#1234',
        denierId: 'pm-user-123',
        guild: mockGuild
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Service unavailable');
    });

    test('should return Unknown error when error not specified', async () => {
      n8nService.moveTicket.mockResolvedValue({
        success: false
      });

      const result = await denyReview({
        ticketKey: 'KAN-123',
        reason: 'Needs more work',
        denierTag: 'pm#1234',
        denierId: 'pm-user-123',
        guild: mockGuild
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    test('should move ticket back to In Progress', async () => {
      n8nService.moveTicket.mockResolvedValue({
        success: true,
        assignee: { emailAddress: 'user@example.com' }
      });
      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: 'user-123',
        discordUser: null
      });
      userLookupService.findUserForum.mockResolvedValue({
        userForum: null,
        ticketThread: null
      });

      const result = await denyReview({
        ticketKey: 'KAN-123',
        reason: 'Needs more work',
        denierTag: 'pm#1234',
        denierId: 'pm-user-123',
        guild: mockGuild
      });

      expect(n8nService.moveTicket).toHaveBeenCalledWith(
        'KAN-123',
        'In Progress',
        expect.objectContaining({ deniedBy: 'pm#1234' })
      );
      expect(result.success).toBe(true);
    });

    test('should notify in working thread when found', async () => {
      const mockWorkingThread = createMockThread({
        name: 'KAN-123: Test',
        archived: false
      });
      const mockWorkingForum = createMockForum({ id: 'forum-456' });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      n8nService.moveTicket.mockResolvedValue({
        success: true,
        assignee: { emailAddress: 'user@example.com' }
      });
      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: 'user-123',
        discordUser: createMockMember({ id: 'user-123' })
      });
      userLookupService.findUserForum.mockResolvedValue({
        userForum: mockWorkingForum,
        ticketThread: mockWorkingThread
      });

      await denyReview({
        ticketKey: 'KAN-123',
        reason: 'Needs more work',
        denierTag: 'pm#1234',
        denierId: 'pm-user-123',
        guild: mockGuild
      });

      expect(mockWorkingThread.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Review Denied')
        })
      );
    });

    test('should unarchive working thread if archived', async () => {
      const mockWorkingThread = createMockThread({
        name: 'KAN-123: Test',
        archived: true
      });
      const mockWorkingForum = createMockForum({ id: 'forum-456' });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      n8nService.moveTicket.mockResolvedValue({
        success: true,
        assignee: { emailAddress: 'user@example.com' }
      });
      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: 'user-123',
        discordUser: createMockMember({ id: 'user-123' })
      });
      userLookupService.findUserForum.mockResolvedValue({
        userForum: mockWorkingForum,
        ticketThread: mockWorkingThread
      });

      await denyReview({
        ticketKey: 'KAN-123',
        reason: 'Needs more work',
        denierTag: 'pm#1234',
        denierId: 'pm-user-123',
        guild: mockGuild
      });

      expect(threadService.unarchiveThread).toHaveBeenCalledWith(mockWorkingThread);
    });

    test('should find thread via threadService when forum found but not thread', async () => {
      const mockWorkingThread = createMockThread({
        name: 'KAN-123: Test',
        archived: false
      });
      const mockWorkingForum = createMockForum({ id: 'forum-456' });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      n8nService.moveTicket.mockResolvedValue({
        success: true,
        assignee: { emailAddress: 'user@example.com' }
      });
      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: 'user-123',
        discordUser: createMockMember({ id: 'user-123' })
      });
      // Forum found but no thread from findUserForum
      userLookupService.findUserForum.mockResolvedValue({
        userForum: mockWorkingForum,
        ticketThread: null
      });
      // Thread found via threadService
      threadService.findTicketThread.mockResolvedValue(mockWorkingThread);

      await denyReview({
        ticketKey: 'KAN-123',
        reason: 'Needs more work',
        denierTag: 'pm#1234',
        denierId: 'pm-user-123',
        guild: mockGuild
      });

      expect(threadService.findTicketThread).toHaveBeenCalledWith(mockWorkingForum, 'KAN-123');
      expect(mockWorkingThread.send).toHaveBeenCalled();
    });

    test('should include assignee ping when discordUserId available', async () => {
      const mockWorkingThread = createMockThread({
        name: 'KAN-123: Test',
        archived: false
      });
      const mockWorkingForum = createMockForum({ id: 'forum-456' });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      n8nService.moveTicket.mockResolvedValue({
        success: true,
        assignee: { emailAddress: 'user@example.com' }
      });
      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: 'user-123',
        discordUser: createMockMember({ id: 'user-123' })
      });
      userLookupService.findUserForum.mockResolvedValue({
        userForum: mockWorkingForum,
        ticketThread: mockWorkingThread
      });

      await denyReview({
        ticketKey: 'KAN-123',
        reason: 'Needs more work',
        denierTag: 'pm#1234',
        denierId: 'pm-user-123',
        guild: mockGuild
      });

      expect(mockWorkingThread.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('<@user-123>')
        })
      );
    });

    test('should not include assignee ping when discordUserId not available', async () => {
      const mockWorkingThread = createMockThread({
        name: 'KAN-123: Test',
        archived: false
      });
      const mockWorkingForum = createMockForum({ id: 'forum-456' });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      n8nService.moveTicket.mockResolvedValue({
        success: true,
        assignee: { emailAddress: 'user@example.com' }
      });
      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: null,
        discordUser: null
      });
      userLookupService.findUserForum.mockResolvedValue({
        userForum: mockWorkingForum,
        ticketThread: mockWorkingThread
      });

      await denyReview({
        ticketKey: 'KAN-123',
        reason: 'Needs more work',
        denierTag: 'pm#1234',
        denierId: 'pm-user-123',
        guild: mockGuild
      });

      // Should have denial message but not start with ping
      expect(mockWorkingThread.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Review Denied')
        })
      );
    });
  });

  describe('quitTicket', () => {
    test('should return error when n8n quitTicket fails', async () => {
      n8nService.quitTicket.mockResolvedValue({
        success: false,
        error: 'Not assigned to this ticket'
      });

      const result = await quitTicket({
        ticketKey: 'KAN-123',
        userId: 'user-123',
        username: 'testuser',
        guild: mockGuild
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not assigned to this ticket');
    });

    test('should return Unknown error when error not specified', async () => {
      n8nService.quitTicket.mockResolvedValue({
        success: false
      });

      const result = await quitTicket({
        ticketKey: 'KAN-123',
        userId: 'user-123',
        username: 'testuser',
        guild: mockGuild
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    test('should quit ticket and archive working thread', async () => {
      const mockWorkingThread = createMockThread({ name: 'KAN-123: Test' });
      const mockWorkingForum = createMockForum({
        id: 'forum-456',
        name: 'tasks-testuser'
      });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      n8nService.quitTicket.mockResolvedValue({ success: true });
      threadService.findTicketThread.mockResolvedValue(mockWorkingThread);

      const result = await quitTicket({
        ticketKey: 'KAN-123',
        userId: 'user-123',
        username: 'testuser',
        guild: mockGuild
      });

      expect(n8nService.quitTicket).toHaveBeenCalledWith('KAN-123', 'user-123', 'testuser');
      expect(result.success).toBe(true);
    });

    test('should post quit message and archive thread when found', async () => {
      const mockWorkingThread = createMockThread({ name: 'KAN-123: Test' });
      const mockWorkingForum = createMockForum({
        id: 'forum-456',
        name: 'tasks-testuser'
      });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      n8nService.quitTicket.mockResolvedValue({ success: true });
      threadService.findTicketThread.mockResolvedValue(mockWorkingThread);

      await quitTicket({
        ticketKey: 'KAN-123',
        userId: 'user-123',
        username: 'testuser',
        guild: mockGuild
      });

      expect(mockWorkingThread.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Task unassigned')
        })
      );
      expect(threadService.archiveThreadWithDelay).toHaveBeenCalled();
    });

    test('should handle when working category not found', async () => {
      n8nService.quitTicket.mockResolvedValue({ success: true });

      const result = await quitTicket({
        ticketKey: 'KAN-123',
        userId: 'user-123',
        username: 'testuser',
        guild: mockGuild
      });

      expect(result.success).toBe(true);
      expect(threadService.archiveThreadWithDelay).not.toHaveBeenCalled();
    });

    test('should handle when forum not found for user', async () => {
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: []
      });

      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);
      n8nService.quitTicket.mockResolvedValue({ success: true });

      const result = await quitTicket({
        ticketKey: 'KAN-123',
        userId: 'user-123',
        username: 'testuser',
        guild: mockGuild
      });

      expect(result.success).toBe(true);
      expect(threadService.findTicketThread).not.toHaveBeenCalled();
    });

    test('should handle when thread not found in forum', async () => {
      const mockWorkingForum = createMockForum({
        id: 'forum-456',
        name: 'tasks-testuser'
      });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);
      n8nService.quitTicket.mockResolvedValue({ success: true });
      threadService.findTicketThread.mockResolvedValue(null);

      const result = await quitTicket({
        ticketKey: 'KAN-123',
        userId: 'user-123',
        username: 'testuser',
        guild: mockGuild
      });

      expect(result.success).toBe(true);
      expect(threadService.archiveThreadWithDelay).not.toHaveBeenCalled();
    });
  });

  describe('hasPmRole', () => {
    test('should return true when user has PM role', async () => {
      const mockMember = createMockMember({ id: 'user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(true);

      const guild = createMockGuild({
        members: [['user-123', mockMember]]
      });

      const result = await hasPmRole(guild, 'user-123');

      expect(result).toBe(true);
      expect(mockMember.roles.cache.has).toHaveBeenCalledWith('pm-role-123');
    });

    test('should return false when user lacks PM role', async () => {
      const mockMember = createMockMember({ id: 'user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(false);

      const guild = createMockGuild({
        members: [['user-123', mockMember]]
      });

      const result = await hasPmRole(guild, 'user-123');

      expect(result).toBe(false);
    });

    test('should return false when member fetch fails', async () => {
      const guild = createMockGuild();
      guild.members.fetch.mockRejectedValue(new Error('Unknown Member'));

      const result = await hasPmRole(guild, 'unknown-user');

      expect(result).toBe(false);
    });
  });
});
