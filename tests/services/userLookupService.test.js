/**
 * Unit tests for userLookupService
 * Tests Discord user lookup and 3-tier forum finding strategy
 * Uses mocked Discord.js and n8nService
 */

// Mock dependencies
jest.mock('../../src/services/n8nService');
jest.mock('../../src/services/threadService');
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
  PermissionFlagsBits,
  createMockGuild,
  createMockMember,
  createMockForum,
  createMockCategory,
  createMockCollection,
  createMockPermissionOverwrite,
  createMockThread
} = require('../../__mocks__/discord.js');

const n8nService = require('../../src/services/n8nService');
const { findTicketThread } = require('../../src/services/threadService');
const { lookupDiscordUser, findUserForum } = require('../../src/services/userLookupService');

describe('userLookupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('lookupDiscordUser', () => {
    test('should return null values when email is null', async () => {
      const guild = createMockGuild();

      const result = await lookupDiscordUser(guild, null);

      expect(result.discordUserId).toBeNull();
      expect(result.discordUser).toBeNull();
      expect(n8nService.lookupUser).not.toHaveBeenCalled();
    });

    test('should return null values when email is undefined', async () => {
      const guild = createMockGuild();

      const result = await lookupDiscordUser(guild, undefined);

      expect(result.discordUserId).toBeNull();
      expect(result.discordUser).toBeNull();
    });

    test('should return null values when email is empty string', async () => {
      const guild = createMockGuild();

      const result = await lookupDiscordUser(guild, '');

      expect(result.discordUserId).toBeNull();
      expect(result.discordUser).toBeNull();
    });

    test('should lookup user via n8n and fetch member', async () => {
      const mockMember = createMockMember({ id: 'user-123', username: 'testuser' });
      const guild = createMockGuild({
        members: [['user-123', mockMember]]
      });

      n8nService.lookupUser.mockResolvedValue({
        success: true,
        discordId: 'user-123'
      });

      const result = await lookupDiscordUser(guild, 'test@example.com');

      expect(n8nService.lookupUser).toHaveBeenCalledWith('test@example.com');
      expect(guild.members.fetch).toHaveBeenCalledWith('user-123');
      expect(result.discordUserId).toBe('user-123');
      expect(result.discordUser).toBe(mockMember);
    });

    test('should return null user when n8n lookup fails', async () => {
      const guild = createMockGuild();
      n8nService.lookupUser.mockRejectedValue(new Error('Service unavailable'));

      const result = await lookupDiscordUser(guild, 'test@example.com');

      expect(result.discordUserId).toBeNull();
      expect(result.discordUser).toBeNull();
    });

    test('should return null user when n8n returns no discordId', async () => {
      const guild = createMockGuild();
      n8nService.lookupUser.mockResolvedValue({
        success: true
        // No discordId returned
      });

      const result = await lookupDiscordUser(guild, 'test@example.com');

      expect(result.discordUserId).toBeNull();
      expect(result.discordUser).toBeNull();
    });

    test('should return discordId but null user when member fetch fails', async () => {
      const guild = createMockGuild();
      guild.members.fetch.mockRejectedValue(new Error('Unknown Member'));

      n8nService.lookupUser.mockResolvedValue({
        success: true,
        discordId: 'user-999'
      });

      const result = await lookupDiscordUser(guild, 'test@example.com');

      expect(result.discordUserId).toBe('user-999');
      expect(result.discordUser).toBeNull();
    });
  });

  describe('findUserForum', () => {
    test('should return null when category is null', async () => {
      const result = await findUserForum(null, 'user-123', null, 'KAN-123');

      expect(result.userForum).toBeNull();
      expect(result.ticketThread).toBeNull();
    });

    test('should return null when category is undefined', async () => {
      const result = await findUserForum(undefined, 'user-123', null, 'KAN-123');

      expect(result.userForum).toBeNull();
      expect(result.ticketThread).toBeNull();
    });

    describe('Tier 1: Find by username', () => {
      test('should find forum by Discord username pattern', async () => {
        const mockForum = createMockForum({
          id: 'forum-123',
          name: 'tasks-testuser',
          type: ChannelType.GuildForum
        });
        const category = createMockCategory({
          children: [['forum-123', mockForum]]
        });
        const discordUser = createMockMember({ id: 'user-123', username: 'testuser' });

        const result = await findUserForum(category, 'user-123', discordUser, 'KAN-123');

        expect(result.userForum).toBe(mockForum);
      });

      test('should sanitize username for forum name matching', async () => {
        const mockForum = createMockForum({
          id: 'forum-123',
          name: 'tasks-testuser123',
          type: ChannelType.GuildForum
        });
        const category = createMockCategory({
          children: [['forum-123', mockForum]]
        });
        // Username with special characters
        const discordUser = createMockMember({ id: 'user-123', username: 'Test.User_123!' });

        const result = await findUserForum(category, 'user-123', discordUser, 'KAN-123');

        expect(result.userForum).toBe(mockForum);
      });

      test('should not find forum if name does not match', async () => {
        const mockForum = createMockForum({
          id: 'forum-123',
          name: 'tasks-otheruser',
          type: ChannelType.GuildForum
        });
        const category = createMockCategory({
          children: [['forum-123', mockForum]]
        });
        const discordUser = createMockMember({ id: 'user-123', username: 'testuser' });

        // Should fall through to Tier 2, then Tier 3, then return null/undefined
        const result = await findUserForum(category, 'user-123', discordUser, 'KAN-123');

        // Forum not found - userForum will be null or undefined
        expect(result.userForum).toBeFalsy();
      });
    });

    describe('Tier 2: Find by permission overwrites', () => {
      test('should find forum by ViewChannel permission', async () => {
        const permOverwrite = createMockPermissionOverwrite({
          id: 'user-123',
          allow: [PermissionFlagsBits.ViewChannel]
        });
        const mockForum = createMockForum({
          id: 'forum-456',
          name: 'tasks-someuser',
          type: ChannelType.GuildForum,
          permissionOverwrites: [['user-123', permOverwrite]]
        });
        const category = createMockCategory({
          children: [['forum-456', mockForum]]
        });

        // No discordUser (Tier 1 skipped), but have discordUserId
        const result = await findUserForum(category, 'user-123', null, 'KAN-123');

        expect(result.userForum).toBe(mockForum);
      });

      test('should not match if user lacks ViewChannel permission', async () => {
        const permOverwrite = createMockPermissionOverwrite({
          id: 'user-123',
          allow: [] // No ViewChannel
        });
        const mockForum = createMockForum({
          id: 'forum-456',
          name: 'tasks-someuser',
          type: ChannelType.GuildForum,
          permissionOverwrites: [['user-123', permOverwrite]]
        });
        const category = createMockCategory({
          children: [['forum-456', mockForum]]
        });

        const result = await findUserForum(category, 'user-123', null, 'KAN-123');

        // Forum not found - userForum will be null or undefined
        expect(result.userForum).toBeFalsy();
      });

      test('should skip Tier 2 when discordUserId is null', async () => {
        const mockForum = createMockForum({
          id: 'forum-456',
          name: 'tasks-someuser',
          type: ChannelType.GuildForum
        });
        const category = createMockCategory({
          children: [['forum-456', mockForum]]
        });

        // Fall through to Tier 3
        const result = await findUserForum(category, null, null, 'KAN-123');

        expect(result.userForum).toBeNull();
      });
    });

    describe('Tier 3: Search all forums for ticket thread', () => {
      test('should find forum containing ticket thread', async () => {
        const mockThread = createMockThread({ name: 'KAN-123: Test Task' });
        const mockForum = createMockForum({
          id: 'forum-789',
          name: 'tasks-anotheruser',
          type: ChannelType.GuildForum
        });
        const category = createMockCategory({
          children: [['forum-789', mockForum]]
        });

        findTicketThread.mockResolvedValue(mockThread);

        const result = await findUserForum(category, null, null, 'KAN-123');

        expect(findTicketThread).toHaveBeenCalledWith(mockForum, 'KAN-123');
        expect(result.userForum).toBe(mockForum);
        expect(result.ticketThread).toBe(mockThread);
      });

      test('should search multiple forums until thread found', async () => {
        const mockThread = createMockThread({ name: 'KAN-123: Test Task' });
        const forum1 = createMockForum({ id: 'forum-1', name: 'tasks-user1', type: ChannelType.GuildForum });
        const forum2 = createMockForum({ id: 'forum-2', name: 'tasks-user2', type: ChannelType.GuildForum });
        const forum3 = createMockForum({ id: 'forum-3', name: 'tasks-user3', type: ChannelType.GuildForum });
        const category = createMockCategory({
          children: [
            ['forum-1', forum1],
            ['forum-2', forum2],
            ['forum-3', forum3]
          ]
        });

        // Thread is in second forum
        findTicketThread
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(mockThread);

        const result = await findUserForum(category, null, null, 'KAN-123');

        expect(findTicketThread).toHaveBeenCalledTimes(2);
        expect(result.userForum).toBe(forum2);
        expect(result.ticketThread).toBe(mockThread);
      });

      test('should return null when thread not found in any forum', async () => {
        const forum1 = createMockForum({ id: 'forum-1', name: 'tasks-user1', type: ChannelType.GuildForum });
        const forum2 = createMockForum({ id: 'forum-2', name: 'tasks-user2', type: ChannelType.GuildForum });
        const category = createMockCategory({
          children: [
            ['forum-1', forum1],
            ['forum-2', forum2]
          ]
        });

        findTicketThread.mockResolvedValue(null);

        const result = await findUserForum(category, null, null, 'KAN-123');

        expect(findTicketThread).toHaveBeenCalledTimes(2);
        expect(result.userForum).toBeNull();
        expect(result.ticketThread).toBeNull();
      });

      test('should only search forum channels', async () => {
        const textChannel = { id: 'text-1', name: 'general', type: ChannelType.GuildText };
        const forum = createMockForum({ id: 'forum-1', name: 'tasks-user', type: ChannelType.GuildForum });
        const category = createMockCategory({
          children: [
            ['text-1', textChannel],
            ['forum-1', forum]
          ]
        });

        findTicketThread.mockResolvedValue(null);

        await findUserForum(category, null, null, 'KAN-123');

        // Should only search the forum, not the text channel
        expect(findTicketThread).toHaveBeenCalledTimes(1);
        expect(findTicketThread).toHaveBeenCalledWith(forum, 'KAN-123');
      });
    });

    describe('Tier priority', () => {
      test('should use Tier 1 result even if Tier 2 would match', async () => {
        const permOverwrite = createMockPermissionOverwrite({
          id: 'user-123',
          allow: [PermissionFlagsBits.ViewChannel]
        });
        const tier1Forum = createMockForum({
          id: 'forum-1',
          name: 'tasks-testuser',
          type: ChannelType.GuildForum
        });
        const tier2Forum = createMockForum({
          id: 'forum-2',
          name: 'tasks-otheruser',
          type: ChannelType.GuildForum,
          permissionOverwrites: [['user-123', permOverwrite]]
        });
        const category = createMockCategory({
          children: [
            ['forum-1', tier1Forum],
            ['forum-2', tier2Forum]
          ]
        });
        const discordUser = createMockMember({ id: 'user-123', username: 'testuser' });

        const result = await findUserForum(category, 'user-123', discordUser, 'KAN-123');

        // Should use Tier 1 forum, not Tier 2
        expect(result.userForum).toBe(tier1Forum);
      });
    });
  });
});
