/**
 * Unit tests for reactionHandler
 * Tests reaction routing to ticket handlers
 */

// Mock config before any imports that might use it
jest.mock('../../src/config', () => ({
  channels: {},
  categories: {},
  roles: {}
}));
jest.mock('../../src/handlers/ticketHandlers');
jest.mock('../../src/utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

const { ChannelType, createMockThread } = require('../../__mocks__/discord.js');
const { handleClaimTicket, handleApproveTicket, handleDenyTicket, handleSubmitForReview } = require('../../src/handlers/ticketHandlers');
const { handleReaction } = require('../../src/handlers/reactionHandler');

describe('reactionHandler', () => {
  let mockConfig;
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      channels: {
        codeUnassigned: 'code-unassigned-123',
        artUnassigned: 'art-unassigned-123',
        audioUnassigned: 'audio-unassigned-123',
        tasksForReview: 'review-forum-123'
      },
      categories: {
        workingTickets: 'working-category-123'
      }
    };

    mockClient = {};
  });

  function createMockReaction(options = {}) {
    return {
      partial: options.partial || false,
      fetch: jest.fn().mockResolvedValue(undefined),
      emoji: {
        name: options.emojiName || '✅'
      },
      message: {
        embeds: options.embeds || [],
        content: options.content || '',
        channel: options.channel || createMockThread({ name: 'KAN-123: Test Task' })
      }
    };
  }

  function createMockUser(options = {}) {
    return {
      id: options.id || 'user-123',
      bot: options.bot || false,
      tag: options.tag || 'testuser#1234',
      username: options.username || 'testuser'
    };
  }

  describe('reaction filtering', () => {
    test('should ignore bot reactions', async () => {
      const reaction = createMockReaction();
      const user = createMockUser({ bot: true });

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleClaimTicket).not.toHaveBeenCalled();
      expect(handleApproveTicket).not.toHaveBeenCalled();
      expect(handleDenyTicket).not.toHaveBeenCalled();
    });

    test('should fetch partial reactions', async () => {
      const reaction = createMockReaction({ partial: true, emojiName: '🎉' });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(reaction.fetch).toHaveBeenCalled();
    });

    test('should ignore non-checkmark/deny emojis', async () => {
      const reaction = createMockReaction({ emojiName: '🎉' });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleClaimTicket).not.toHaveBeenCalled();
      expect(handleApproveTicket).not.toHaveBeenCalled();
      expect(handleDenyTicket).not.toHaveBeenCalled();
    });

    test('should ignore reactions not in threads', async () => {
      const textChannel = {
        type: ChannelType.GuildText,
        name: 'KAN-123: Test'
      };
      const reaction = createMockReaction({ channel: textChannel });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleClaimTicket).not.toHaveBeenCalled();
    });

    test('should ignore reactions when no ticket key found', async () => {
      const thread = {
        type: ChannelType.PublicThread,
        name: 'Random Thread Name',
        parentId: 'code-unassigned-123'
      };
      const reaction = createMockReaction({ channel: thread });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleClaimTicket).not.toHaveBeenCalled();
    });
  });

  describe('ticket key extraction', () => {
    test('should extract ticket key from thread name', async () => {
      const thread = {
        type: ChannelType.PublicThread,
        name: 'KAN-456: Some Task',
        parentId: 'code-unassigned-123'
      };
      const reaction = createMockReaction({ channel: thread });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleClaimTicket).toHaveBeenCalledWith(
        reaction,
        user,
        'KAN-456',
        thread,
        mockConfig
      );
    });

    test('should extract ticket key from embed title', async () => {
      const thread = {
        type: ChannelType.PublicThread,
        name: 'Random Name',
        parentId: 'code-unassigned-123'
      };
      const embeds = [{ title: 'ABC-789: Task Title' }];
      const reaction = createMockReaction({ channel: thread, embeds });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleClaimTicket).toHaveBeenCalledWith(
        reaction,
        user,
        'ABC-789',
        thread,
        mockConfig
      );
    });

    test('should extract ticket key from embed URL', async () => {
      const thread = {
        type: ChannelType.PublicThread,
        name: 'Random Name',
        parentId: 'code-unassigned-123'
      };
      const embeds = [{ title: 'No key here', url: 'https://jira.example.com/browse/XYZ-123' }];
      const reaction = createMockReaction({ channel: thread, embeds });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleClaimTicket).toHaveBeenCalledWith(
        reaction,
        user,
        'XYZ-123',
        thread,
        mockConfig
      );
    });
  });

  describe('claim ticket routing', () => {
    test('should route checkmark on code unassigned to handleClaimTicket', async () => {
      const thread = {
        type: ChannelType.PublicThread,
        name: 'KAN-123: Test',
        parentId: 'code-unassigned-123'
      };
      const reaction = createMockReaction({ channel: thread, emojiName: '✅' });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleClaimTicket).toHaveBeenCalledWith(
        reaction, user, 'KAN-123', thread, mockConfig
      );
    });

    test('should route checkmark on art unassigned to handleClaimTicket', async () => {
      const thread = {
        type: ChannelType.PublicThread,
        name: 'KAN-123: Test',
        parentId: 'art-unassigned-123'
      };
      const reaction = createMockReaction({ channel: thread, emojiName: '✔️' });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleClaimTicket).toHaveBeenCalled();
    });

    test('should route checkmark on audio unassigned to handleClaimTicket', async () => {
      const thread = {
        type: ChannelType.PublicThread,
        name: 'KAN-123: Test',
        parentId: 'audio-unassigned-123'
      };
      const reaction = createMockReaction({ channel: thread, emojiName: '☑️' });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleClaimTicket).toHaveBeenCalled();
    });
  });

  describe('approve/deny ticket routing', () => {
    test('should route checkmark on review forum to handleApproveTicket', async () => {
      const thread = {
        type: ChannelType.PublicThread,
        name: 'KAN-123: Test',
        parentId: 'review-forum-123'
      };
      const reaction = createMockReaction({ channel: thread, emojiName: '✅' });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleApproveTicket).toHaveBeenCalledWith(
        reaction, user, 'KAN-123', thread, mockConfig
      );
      expect(handleClaimTicket).not.toHaveBeenCalled();
    });

    test('should route X on review forum to handleDenyTicket', async () => {
      const thread = {
        type: ChannelType.PublicThread,
        name: 'KAN-123: Test',
        parentId: 'review-forum-123'
      };
      const reaction = createMockReaction({ channel: thread, emojiName: '❌' });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleDenyTicket).toHaveBeenCalledWith(
        reaction, user, 'KAN-123', thread, mockConfig
      );
      expect(handleApproveTicket).not.toHaveBeenCalled();
    });

    test('should handle ✖️ as deny emoji', async () => {
      const thread = {
        type: ChannelType.PublicThread,
        name: 'KAN-123: Test',
        parentId: 'review-forum-123'
      };
      const reaction = createMockReaction({ channel: thread, emojiName: '✖️' });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleDenyTicket).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    test('should handle partial reaction fetch error gracefully', async () => {
      const reaction = createMockReaction({ partial: true });
      reaction.fetch.mockRejectedValue(new Error('Failed to fetch'));
      const user = createMockUser();

      // Should not throw
      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleClaimTicket).not.toHaveBeenCalled();
    });

    test('should handle private threads', async () => {
      const thread = {
        type: ChannelType.PrivateThread,
        name: 'KAN-123: Test',
        parentId: 'code-unassigned-123'
      };
      const reaction = createMockReaction({ channel: thread });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleClaimTicket).toHaveBeenCalled();
    });

    test('should not route deny emoji on unassigned channels', async () => {
      const thread = {
        type: ChannelType.PublicThread,
        name: 'KAN-123: Test',
        parentId: 'code-unassigned-123'
      };
      const reaction = createMockReaction({ channel: thread, emojiName: '❌' });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      // Deny on unassigned should do nothing
      expect(handleClaimTicket).not.toHaveBeenCalled();
      expect(handleDenyTicket).not.toHaveBeenCalled();
    });
  });

  describe('submit for review routing', () => {
    test('should route clipboard emoji in working tickets to handleSubmitForReview', async () => {
      const thread = {
        type: ChannelType.PublicThread,
        name: 'KAN-123: Test',
        parentId: 'user-forum-123',
        parent: {
          parentId: 'working-category-123'
        }
      };
      const reaction = createMockReaction({ channel: thread, emojiName: '📋' });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleSubmitForReview).toHaveBeenCalledWith(
        reaction, user, 'KAN-123', thread, mockConfig
      );
      expect(handleClaimTicket).not.toHaveBeenCalled();
    });

    test('should handle "clipboard" emoji name variant', async () => {
      const thread = {
        type: ChannelType.PublicThread,
        name: 'KAN-123: Test',
        parentId: 'user-forum-123',
        parent: {
          parentId: 'working-category-123'
        }
      };
      const reaction = createMockReaction({ channel: thread, emojiName: 'clipboard' });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleSubmitForReview).toHaveBeenCalled();
    });

    test('should not route clipboard emoji outside working tickets category', async () => {
      const thread = {
        type: ChannelType.PublicThread,
        name: 'KAN-123: Test',
        parentId: 'other-forum-123',
        parent: {
          parentId: 'other-category-123'
        }
      };
      const reaction = createMockReaction({ channel: thread, emojiName: '📋' });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleSubmitForReview).not.toHaveBeenCalled();
    });

    test('should not route clipboard emoji when parent is null', async () => {
      const thread = {
        type: ChannelType.PublicThread,
        name: 'KAN-123: Test',
        parentId: 'user-forum-123',
        parent: null
      };
      const reaction = createMockReaction({ channel: thread, emojiName: '📋' });
      const user = createMockUser();

      await handleReaction(reaction, user, mockClient, mockConfig);

      expect(handleSubmitForReview).not.toHaveBeenCalled();
    });
  });
});
