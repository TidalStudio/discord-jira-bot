/**
 * Unit tests for ticketHandlers
 * Tests claim, approve, and deny ticket workflows
 */

jest.mock('../../src/services/userLookupService');
jest.mock('../../src/services/threadService');
jest.mock('../../src/services/forumService');
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
  createMockThread,
  createMockForum,
  createMockCategory,
  createMockMember,
  createMockCollection
} = require('../../__mocks__/discord.js');

const userLookupService = require('../../src/services/userLookupService');
const threadService = require('../../src/services/threadService');
const forumService = require('../../src/services/forumService');

const {
  handleClaimTicket,
  handleApproveTicket,
  handleDenyTicket
} = require('../../src/handlers/ticketHandlers');

describe('ticketHandlers', () => {
  let mockConfig;
  let mockGuild;
  let originalFetch;

  beforeEach(() => {
    jest.clearAllMocks();

    // Save original fetch and set up mock
    originalFetch = global.fetch;
    global.fetch = jest.fn();

    mockConfig = {
      n8nBaseUrl: 'https://n8n.example.com',
      webhooks: {
        assignTicket: '/webhook/assign-ticket',
        moveTicket: '/webhook/move-ticket'
      },
      categories: {
        workingTickets: 'working-category-123'
      },
      channels: {
        tasksForReview: 'review-forum-123'
      },
      roles: {
        pm: 'pm-role-123'
      }
    };

    mockGuild = createMockGuild();
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  function createMockReaction() {
    return {
      emoji: { name: '✅' }
    };
  }

  function createMockUser(options = {}) {
    return {
      id: options.id || 'user-123',
      username: options.username || 'testuser',
      tag: options.tag || 'testuser#1234'
    };
  }

  describe('handleClaimTicket', () => {
    test('should claim ticket successfully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          summary: 'Test Task',
          description: 'Task description'
        })
      });

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser();
      const reaction = createMockReaction();

      forumService.findOrCreateUserTaskForum.mockResolvedValue(
        createMockForum({ name: 'tasks-testuser' })
      );
      forumService.createTaskThread.mockResolvedValue(
        createMockThread({ name: 'KAN-123: Test Task' })
      );

      await handleClaimTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/assign-ticket',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('KAN-123')
        })
      );
      expect(thread.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('claimed')
        })
      );
      expect(forumService.findOrCreateUserTaskForum).toHaveBeenCalled();
      expect(forumService.createTaskThread).toHaveBeenCalled();
      expect(threadService.deleteThreadWithDelay).toHaveBeenCalled();
    });

    test('should handle webhook error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: false,
          error: 'User not registered'
        })
      });

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser();
      const reaction = createMockReaction();

      await handleClaimTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(thread.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Could not claim ticket')
        })
      );
      expect(forumService.findOrCreateUserTaskForum).not.toHaveBeenCalled();
    });

    test('should handle fetch error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser();
      const reaction = createMockReaction();

      await handleClaimTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(thread.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Error processing claim')
        })
      );
    });

    test('should continue if forum creation fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          summary: 'Test Task'
        })
      });

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser();
      const reaction = createMockReaction();

      forumService.findOrCreateUserTaskForum.mockResolvedValue(null);

      await handleClaimTicket(reaction, user, 'KAN-123', thread, mockConfig);

      // Should still send confirmation and delete thread
      expect(thread.send).toHaveBeenCalled();
      expect(threadService.deleteThreadWithDelay).toHaveBeenCalled();
      // But not create task thread
      expect(forumService.createTaskThread).not.toHaveBeenCalled();
    });
  });

  describe('handleApproveTicket', () => {
    test('should reject non-PM users', async () => {
      const mockMember = createMockMember({ id: 'user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(false);
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser();
      const reaction = createMockReaction();

      await handleApproveTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(thread.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Only PMs can approve')
        })
      );
      // fetch should not be called for the webhook
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should approve ticket when PM', async () => {
      const mockMember = createMockMember({ id: 'pm-user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(true);
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          assignee: { emailAddress: 'user@example.com' }
        })
      });

      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: 'user-123',
        discordUser: createMockMember({ id: 'user-123' })
      });
      userLookupService.findUserForum.mockResolvedValue({
        userForum: null,
        ticketThread: null
      });

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser({ id: 'pm-user-123' });
      const reaction = createMockReaction();

      await handleApproveTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/move-ticket',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Done')
        })
      );
      expect(forumService.createCompletedTaskThread).toHaveBeenCalled();
      expect(threadService.deleteThreadWithDelay).toHaveBeenCalled();
    });

    test('should delete working thread when found', async () => {
      const mockMember = createMockMember({ id: 'pm-user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(true);

      const mockWorkingThread = createMockThread({ name: 'KAN-123: Test' });
      const mockWorkingForum = createMockForum({ id: 'forum-456' });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.members.fetch.mockResolvedValue(mockMember);
      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          assignee: { emailAddress: 'user@example.com' }
        })
      });

      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: 'user-123',
        discordUser: createMockMember({ id: 'user-123' })
      });
      userLookupService.findUserForum.mockResolvedValue({
        userForum: mockWorkingForum,
        ticketThread: mockWorkingThread
      });

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser({ id: 'pm-user-123' });
      const reaction = createMockReaction();

      await handleApproveTicket(reaction, user, 'KAN-123', thread, mockConfig);

      // Should delete both working thread and review thread
      expect(threadService.deleteThreadWithDelay).toHaveBeenCalledTimes(2);
    });

    test('should handle webhook error', async () => {
      const mockMember = createMockMember({ id: 'pm-user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(true);
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: false,
          error: 'Ticket not found'
        })
      });

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser({ id: 'pm-user-123' });
      const reaction = createMockReaction();

      await handleApproveTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(thread.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Could not approve ticket')
        })
      );
    });

    test('should handle fetch error', async () => {
      const mockMember = createMockMember({ id: 'pm-user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(true);
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser({ id: 'pm-user-123' });
      const reaction = createMockReaction();

      await handleApproveTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(thread.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Error')
        })
      );
    });

    test('should find thread via findTicketThread when forum found but not thread', async () => {
      const mockMember = createMockMember({ id: 'pm-user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(true);

      const mockWorkingThread = createMockThread({ name: 'KAN-123: Test' });
      const mockWorkingForum = createMockForum({ id: 'forum-456' });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.members.fetch.mockResolvedValue(mockMember);
      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          assignee: { emailAddress: 'user@example.com' }
        })
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
      // Note: findTicketThread is on userLookupService in ticketHandlers
      userLookupService.findTicketThread = jest.fn().mockResolvedValue(mockWorkingThread);

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser({ id: 'pm-user-123' });
      const reaction = createMockReaction();

      await handleApproveTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(userLookupService.findTicketThread).toHaveBeenCalledWith(mockWorkingForum, 'KAN-123');
    });

    test('should handle member fetch error on PM check', async () => {
      mockGuild.members.fetch.mockRejectedValue(new Error('Unknown member'));

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser({ id: 'unknown-user' });
      const reaction = createMockReaction();

      await expect(handleApproveTicket(reaction, user, 'KAN-123', thread, mockConfig))
        .rejects.toThrow('Unknown member');
    });
  });

  describe('handleDenyTicket', () => {
    test('should reject non-PM users', async () => {
      const mockMember = createMockMember({ id: 'user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(false);
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser();
      const reaction = createMockReaction();

      await handleDenyTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(thread.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Only PMs can deny')
        })
      );
    });

    test('should deny ticket when PM', async () => {
      const mockMember = createMockMember({ id: 'pm-user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(true);
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          assignee: { emailAddress: 'user@example.com' }
        })
      });

      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: 'user-123',
        discordUser: createMockMember({ id: 'user-123' })
      });
      userLookupService.findUserForum.mockResolvedValue({
        userForum: null,
        ticketThread: null
      });

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser({ id: 'pm-user-123' });
      const reaction = createMockReaction();

      await handleDenyTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/move-ticket',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('In Progress')
        })
      );
      expect(threadService.deleteThreadWithDelay).toHaveBeenCalled();
    });

    test('should notify in working thread when found', async () => {
      const mockMember = createMockMember({ id: 'pm-user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(true);

      const mockWorkingThread = createMockThread({
        name: 'KAN-123: Test',
        archived: false
      });
      const mockWorkingForum = createMockForum({ id: 'forum-456' });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.members.fetch.mockResolvedValue(mockMember);
      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          assignee: { emailAddress: 'user@example.com' }
        })
      });

      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: 'user-123',
        discordUser: createMockMember({ id: 'user-123' })
      });
      userLookupService.findUserForum.mockResolvedValue({
        userForum: mockWorkingForum,
        ticketThread: mockWorkingThread
      });

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser({ id: 'pm-user-123' });
      const reaction = createMockReaction();

      await handleDenyTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(mockWorkingThread.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Review Denied')
        })
      );
    });

    test('should unarchive working thread if archived', async () => {
      const mockMember = createMockMember({ id: 'pm-user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(true);

      const mockWorkingThread = createMockThread({
        name: 'KAN-123: Test',
        archived: true
      });
      const mockWorkingForum = createMockForum({ id: 'forum-456' });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.members.fetch.mockResolvedValue(mockMember);
      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          assignee: { emailAddress: 'user@example.com' }
        })
      });

      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: 'user-123',
        discordUser: createMockMember({ id: 'user-123' })
      });
      userLookupService.findUserForum.mockResolvedValue({
        userForum: mockWorkingForum,
        ticketThread: mockWorkingThread
      });

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser({ id: 'pm-user-123' });
      const reaction = createMockReaction();

      await handleDenyTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(mockWorkingThread.setArchived).toHaveBeenCalledWith(false);
    });

    test('should handle webhook error', async () => {
      const mockMember = createMockMember({ id: 'pm-user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(true);
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: false,
          error: 'Internal error'
        })
      });

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser({ id: 'pm-user-123' });
      const reaction = createMockReaction();

      await handleDenyTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(thread.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Could not deny ticket')
        })
      );
    });

    test('should handle fetch error', async () => {
      const mockMember = createMockMember({ id: 'pm-user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(true);
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser({ id: 'pm-user-123' });
      const reaction = createMockReaction();

      await handleDenyTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(thread.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Error')
        })
      );
    });

    test('should find thread via findTicketThread when forum found but not thread', async () => {
      const mockMember = createMockMember({ id: 'pm-user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(true);

      const mockWorkingThread = createMockThread({
        name: 'KAN-123: Test',
        archived: false
      });
      const mockWorkingForum = createMockForum({ id: 'forum-456' });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.members.fetch.mockResolvedValue(mockMember);
      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          assignee: { emailAddress: 'user@example.com' }
        })
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
      // Thread found via findTicketThread
      userLookupService.findTicketThread = jest.fn().mockResolvedValue(mockWorkingThread);

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser({ id: 'pm-user-123' });
      const reaction = createMockReaction();

      await handleDenyTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(userLookupService.findTicketThread).toHaveBeenCalledWith(mockWorkingForum, 'KAN-123');
      expect(mockWorkingThread.send).toHaveBeenCalled();
    });

    test('should handle when working category not found', async () => {
      const mockMember = createMockMember({ id: 'pm-user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(true);
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          assignee: { emailAddress: 'user@example.com' }
        })
      });

      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: null,
        discordUser: null
      });

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser({ id: 'pm-user-123' });
      const reaction = createMockReaction();

      // Should not throw, just log and continue
      await handleDenyTicket(reaction, user, 'KAN-123', thread, mockConfig);

      expect(threadService.deleteThreadWithDelay).toHaveBeenCalled();
    });

    test('should handle when forum not found for user', async () => {
      const mockMember = createMockMember({ id: 'pm-user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(true);

      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: []
      });

      mockGuild.members.fetch.mockResolvedValue(mockMember);
      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          assignee: { emailAddress: 'user@example.com' }
        })
      });

      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: 'user-123',
        discordUser: createMockMember({ id: 'user-123' })
      });
      userLookupService.findUserForum.mockResolvedValue({
        userForum: null,
        ticketThread: null
      });

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser({ id: 'pm-user-123' });
      const reaction = createMockReaction();

      await handleDenyTicket(reaction, user, 'KAN-123', thread, mockConfig);

      // Should still delete the review thread
      expect(threadService.deleteThreadWithDelay).toHaveBeenCalled();
    });

    test('should handle when thread not found in forum', async () => {
      const mockMember = createMockMember({ id: 'pm-user-123' });
      mockMember.roles.cache.has = jest.fn().mockReturnValue(true);

      const mockWorkingForum = createMockForum({ id: 'forum-456' });
      const mockWorkingCategory = createMockCategory({
        id: 'working-category-123',
        children: [['forum-456', mockWorkingForum]]
      });

      mockGuild.members.fetch.mockResolvedValue(mockMember);
      mockGuild.channels.cache.set('working-category-123', mockWorkingCategory);

      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          assignee: { emailAddress: 'user@example.com' }
        })
      });

      userLookupService.lookupDiscordUser.mockResolvedValue({
        discordUserId: 'user-123',
        discordUser: createMockMember({ id: 'user-123' })
      });
      userLookupService.findUserForum.mockResolvedValue({
        userForum: mockWorkingForum,
        ticketThread: null
      });
      userLookupService.findTicketThread = jest.fn().mockResolvedValue(null);

      const thread = createMockThread({ name: 'KAN-123: Test' });
      thread.guild = mockGuild;
      const user = createMockUser({ id: 'pm-user-123' });
      const reaction = createMockReaction();

      await handleDenyTicket(reaction, user, 'KAN-123', thread, mockConfig);

      // Should still delete the review thread
      expect(threadService.deleteThreadWithDelay).toHaveBeenCalled();
    });
  });
});
