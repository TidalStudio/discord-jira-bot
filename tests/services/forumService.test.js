/**
 * Unit tests for forumService
 * Tests forum creation and task thread posting
 * Uses mocked Discord.js and config
 */

// Mock dependencies before requiring the module
jest.mock('../../src/config', () => ({
  jiraBaseUrl: 'https://jira.example.com',
  categories: {
    workingTickets: 'category-working',
    completedTasks: 'category-completed'
  }
}));

jest.mock('../../src/utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

// Mock jiraParserService
jest.mock('../../src/services/jiraParserService', () => ({
  parseJiraDescription: jest.fn((desc) => {
    if (!desc) return 'No description provided.';
    if (typeof desc === 'string') return desc;
    return 'Parsed ADF content';
  })
}));

const {
  ChannelType,
  PermissionFlagsBits,
  createMockForum,
  createMockCategory,
  createMockCollection,
  createMockThread
} = require('../../__mocks__/discord.js');

const {
  findOrCreateUserTaskForum,
  createTaskThread,
  createCompletedTaskThread
} = require('../../src/services/forumService');

const { parseJiraDescription } = require('../../src/services/jiraParserService');

/**
 * Helper to create a mock guild with proper channel cache
 */
function createTestGuild(options = {}) {
  const channelsCache = createMockCollection(options.channels || []);

  return {
    id: options.id || 'guild-123',
    name: options.name || 'Test Guild',
    channels: {
      cache: channelsCache,
      create: jest.fn().mockImplementation((data) => {
        if (data.type === ChannelType.GuildForum) {
          return Promise.resolve(createMockForum({ name: data.name }));
        }
        return Promise.resolve({ id: 'new-channel', name: data.name, type: data.type });
      })
    }
  };
}

describe('forumService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findOrCreateUserTaskForum', () => {
    test('should find existing forum in category', async () => {
      const existingForum = createMockForum({
        id: 'forum-123',
        name: 'tasks-testuser',
        type: ChannelType.GuildForum
      });
      const category = createMockCategory({
        id: 'category-working',
        children: [['forum-123', existingForum]]
      });
      const guild = createTestGuild({
        channels: [['category-working', category]]
      });
      const user = { id: 'user-123', username: 'testuser', tag: 'testuser#1234' };
      const client = { user: { id: 'bot-123' } };

      const result = await findOrCreateUserTaskForum(guild, user, 'category-working', client);

      expect(result).toBe(existingForum);
      expect(guild.channels.create).not.toHaveBeenCalled();
    });

    test('should create new forum when not found', async () => {
      const newForum = createMockForum({
        id: 'new-forum',
        name: 'tasks-newuser',
        type: ChannelType.GuildForum
      });
      const category = createMockCategory({
        id: 'category-working',
        children: [] // Empty category
      });
      const guild = createTestGuild({
        id: 'guild-123',
        channels: [['category-working', category]]
      });
      guild.channels.create.mockResolvedValue(newForum);

      const user = { id: 'user-456', username: 'newuser', tag: 'newuser#5678' };
      const client = { user: { id: 'bot-123' } };

      const result = await findOrCreateUserTaskForum(guild, user, 'category-working', client);

      expect(guild.channels.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tasks-newuser',
          type: ChannelType.GuildForum,
          parent: 'category-working',
          topic: 'Personal task board for newuser'
        })
      );
      expect(result).toBe(newForum);
    });

    test('should sanitize username for forum name', async () => {
      const category = createMockCategory({ id: 'category-working', children: [] });
      const guild = createTestGuild({
        id: 'guild-123',
        channels: [['category-working', category]]
      });
      guild.channels.create.mockResolvedValue(createMockForum({ name: 'tasks-testuser123' }));

      const user = { id: 'user-789', username: 'Test.User_123!', tag: 'Test.User_123!#0000' };
      const client = { user: { id: 'bot-123' } };

      await findOrCreateUserTaskForum(guild, user, 'category-working', client);

      expect(guild.channels.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tasks-testuser123'
        })
      );
    });

    test('should set correct permission overwrites', async () => {
      const category = createMockCategory({ id: 'category-working', children: [] });
      const guild = createTestGuild({
        id: 'guild-123',
        channels: [['category-working', category]]
      });
      guild.channels.create.mockResolvedValue(createMockForum({}));

      const user = { id: 'user-111', username: 'permuser', tag: 'permuser#1111' };
      const client = { user: { id: 'bot-999' } };

      await findOrCreateUserTaskForum(guild, user, 'category-working', client);

      const createCall = guild.channels.create.mock.calls[0][0];
      const perms = createCall.permissionOverwrites;

      // Check @everyone deny
      expect(perms).toContainEqual(
        expect.objectContaining({
          id: 'guild-123',
          deny: [PermissionFlagsBits.ViewChannel]
        })
      );

      // Check user allow
      expect(perms).toContainEqual(
        expect.objectContaining({
          id: 'user-111',
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
        })
      );

      // Check bot allow
      expect(perms).toContainEqual(
        expect.objectContaining({
          id: 'bot-999',
          allow: expect.arrayContaining([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageThreads
          ])
        })
      );
    });

    test('should return null when forum creation fails', async () => {
      const category = createMockCategory({ id: 'category-working', children: [] });
      const guild = createTestGuild({
        channels: [['category-working', category]]
      });
      guild.channels.create.mockRejectedValue(new Error('Permission denied'));

      const user = { id: 'user-123', username: 'failuser', tag: 'failuser#0000' };
      const client = { user: { id: 'bot-123' } };

      const result = await findOrCreateUserTaskForum(guild, user, 'category-working', client);

      expect(result).toBeNull();
    });

    test('should handle missing category gracefully', async () => {
      const guild = createTestGuild({ channels: [] });

      const user = { id: 'user-123', username: 'testuser', tag: 'testuser#0000' };
      const client = { user: { id: 'bot-123' } };

      // Category not found, so cannot find existing forum
      // Will attempt to create forum (which may succeed or fail depending on Discord)
      const result = await findOrCreateUserTaskForum(guild, user, 'nonexistent', client);

      // The function will try to create since category.children check is skipped
      expect(guild.channels.create).toHaveBeenCalled();
    });
  });

  describe('createTaskThread', () => {
    test('should create thread with embed', async () => {
      const mockThread = createMockThread({ name: 'KAN-123: Test Task' });
      const forum = createMockForum();
      forum.threads.create.mockResolvedValue(mockThread);

      const ticketData = {
        ticketKey: 'KAN-123',
        title: 'Test Task',
        description: 'Task description',
        priority: 'High',
        labels: ['bug', 'urgent'],
        userId: 'user-123'
      };

      const result = await createTaskThread(forum, ticketData);

      expect(forum.threads.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'KAN-123: Test Task',
          message: expect.objectContaining({
            embeds: expect.arrayContaining([
              expect.objectContaining({
                title: 'KAN-123: Test Task',
                url: 'https://jira.example.com/browse/KAN-123'
              })
            ])
          })
        })
      );
      expect(result).toBe(mockThread);
    });

    test('should strip ticket key prefix from title', async () => {
      const mockThread = createMockThread({});
      const forum = createMockForum();
      forum.threads.create.mockResolvedValue(mockThread);

      const ticketData = {
        ticketKey: 'KAN-456',
        title: 'KAN-456: Already Prefixed Title',
        description: '',
        priority: 'Medium',
        labels: [],
        userId: 'user-123'
      };

      await createTaskThread(forum, ticketData);

      const createCall = forum.threads.create.mock.calls[0][0];
      expect(createCall.name).toBe('KAN-456: Already Prefixed Title');
    });

    test('should include labels as array', async () => {
      const mockThread = createMockThread({});
      const forum = createMockForum();
      forum.threads.create.mockResolvedValue(mockThread);

      const ticketData = {
        ticketKey: 'KAN-789',
        title: 'Label Test',
        description: '',
        priority: 'Low',
        labels: ['frontend', 'enhancement'],
        userId: 'user-123'
      };

      await createTaskThread(forum, ticketData);

      const createCall = forum.threads.create.mock.calls[0][0];
      const labelField = createCall.message.embeds[0].fields.find(f => f.name === 'Labels');
      expect(labelField.value).toBe('frontend, enhancement');
    });

    test('should handle labels as string', async () => {
      const mockThread = createMockThread({});
      const forum = createMockForum();
      forum.threads.create.mockResolvedValue(mockThread);

      const ticketData = {
        ticketKey: 'KAN-111',
        title: 'Single Label',
        description: '',
        priority: 'Medium',
        labels: 'single-label',
        userId: 'user-123'
      };

      await createTaskThread(forum, ticketData);

      const createCall = forum.threads.create.mock.calls[0][0];
      const labelField = createCall.message.embeds[0].fields.find(f => f.name === 'Labels');
      expect(labelField.value).toBe('single-label');
    });

    test('should not include labels field when empty', async () => {
      const mockThread = createMockThread({});
      const forum = createMockForum();
      forum.threads.create.mockResolvedValue(mockThread);

      const ticketData = {
        ticketKey: 'KAN-222',
        title: 'No Labels',
        description: '',
        priority: 'Medium',
        labels: [],
        userId: 'user-123'
      };

      await createTaskThread(forum, ticketData);

      const createCall = forum.threads.create.mock.calls[0][0];
      const labelField = createCall.message.embeds[0].fields.find(f => f.name === 'Labels');
      expect(labelField).toBeUndefined();
    });

    test('should send description as separate message', async () => {
      const mockThread = createMockThread({});
      const forum = createMockForum();
      forum.threads.create.mockResolvedValue(mockThread);

      const ticketData = {
        ticketKey: 'KAN-333',
        title: 'With Description',
        description: 'This is the task description',
        priority: 'High',
        labels: [],
        userId: 'user-123'
      };

      await createTaskThread(forum, ticketData);

      expect(parseJiraDescription).toHaveBeenCalledWith('This is the task description');
      expect(mockThread.send).toHaveBeenCalledWith({ content: 'This is the task description' });
    });

    test('should truncate long descriptions', async () => {
      const mockThread = createMockThread({});
      const forum = createMockForum();
      forum.threads.create.mockResolvedValue(mockThread);

      // Create a very long description
      const longDescription = 'A'.repeat(2000);
      parseJiraDescription.mockReturnValue(longDescription);

      const ticketData = {
        ticketKey: 'KAN-444',
        title: 'Long Description',
        description: longDescription,
        priority: 'Low',
        labels: [],
        userId: 'user-123'
      };

      await createTaskThread(forum, ticketData);

      const sentContent = mockThread.send.mock.calls[0][0].content;
      expect(sentContent.length).toBeLessThanOrEqual(2000);
      expect(sentContent).toContain('[View full description in Jira]');
    });

    test('should return null when thread creation fails', async () => {
      const forum = createMockForum();
      forum.threads.create.mockRejectedValue(new Error('Failed to create thread'));

      const ticketData = {
        ticketKey: 'KAN-555',
        title: 'Fail Test',
        description: '',
        priority: 'Medium',
        labels: [],
        userId: 'user-123'
      };

      const result = await createTaskThread(forum, ticketData);

      expect(result).toBeNull();
    });

    test('should handle null description', async () => {
      const mockThread = createMockThread({});
      const forum = createMockForum();
      forum.threads.create.mockResolvedValue(mockThread);
      parseJiraDescription.mockReturnValue('No description provided.');

      const ticketData = {
        ticketKey: 'KAN-666',
        title: 'No Description',
        description: null,
        priority: 'Medium',
        labels: [],
        userId: 'user-123'
      };

      await createTaskThread(forum, ticketData);

      expect(mockThread.send).toHaveBeenCalledWith({ content: 'No description provided.' });
    });
  });

  describe('createCompletedTaskThread', () => {
    test('should create completed task thread in completed forum', async () => {
      const mockThread = createMockThread({ name: '✅ KAN-123: Completed Task' });
      const completedForum = createMockForum({
        id: 'completed-forum',
        name: 'tasks-assignee',
        type: ChannelType.GuildForum
      });
      completedForum.threads.create.mockResolvedValue(mockThread);

      const completedCategory = createMockCategory({
        id: 'category-completed',
        children: [['completed-forum', completedForum]]
      });
      const guild = createTestGuild({
        channels: [['category-completed', completedCategory]]
      });

      const ticketInfo = {
        summary: 'Completed Task',
        assignee: { displayName: 'assignee' }
      };
      const approver = { tag: 'pm#1234' };

      const result = await createCompletedTaskThread(guild, 'KAN-123', ticketInfo, approver);

      expect(completedForum.threads.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '✅ KAN-123: Completed Task',
          message: expect.objectContaining({
            embeds: expect.arrayContaining([
              expect.objectContaining({
                title: '✅ KAN-123: Completed Task'
              })
            ])
          })
        })
      );
      expect(result).toBe(mockThread);
    });

    test('should create forum if not exists in completed category', async () => {
      const mockThread = createMockThread({});
      const newForum = createMockForum({ name: 'tasks-newassignee' });
      newForum.threads.create.mockResolvedValue(mockThread);

      const completedCategory = createMockCategory({
        id: 'category-completed',
        children: [] // Empty
      });
      const guild = createTestGuild({
        channels: [['category-completed', completedCategory]]
      });
      guild.channels.create.mockResolvedValue(newForum);

      const ticketInfo = {
        summary: 'New Completed Task',
        assignee: { displayName: 'NewAssignee' }
      };
      const approver = { tag: 'pm#0000' };

      await createCompletedTaskThread(guild, 'KAN-999', ticketInfo, approver);

      expect(guild.channels.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tasks-newassignee',
          type: ChannelType.GuildForum
        })
      );
    });

    test('should handle missing assignee', async () => {
      const mockThread = createMockThread({});
      const completedForum = createMockForum({
        name: 'tasks-unassigned',
        type: ChannelType.GuildForum
      });
      completedForum.threads.create.mockResolvedValue(mockThread);

      const completedCategory = createMockCategory({
        id: 'category-completed',
        children: [['forum', completedForum]]
      });
      const guild = createTestGuild({
        channels: [['category-completed', completedCategory]]
      });

      const ticketInfo = {
        summary: 'Unassigned Task',
        assignee: null
      };
      const approver = { tag: 'pm#1111' };

      await createCompletedTaskThread(guild, 'KAN-888', ticketInfo, approver);

      // Should use 'Unassigned' as fallback
      const createCall = completedForum.threads.create.mock.calls[0][0];
      const completedByField = createCall.message.embeds[0].fields.find(f => f.name === 'Completed By');
      expect(completedByField.value).toBe('Unassigned');
    });

    test('should return null when forum creation fails', async () => {
      const completedCategory = createMockCategory({
        id: 'category-completed',
        children: []
      });
      const guild = createTestGuild({
        channels: [['category-completed', completedCategory]]
      });
      guild.channels.create.mockRejectedValue(new Error('Cannot create forum'));

      const ticketInfo = { summary: 'Fail', assignee: { name: 'test' } };
      const approver = { tag: 'pm#0000' };

      const result = await createCompletedTaskThread(guild, 'KAN-777', ticketInfo, approver);

      expect(result).toBeNull();
    });

    test('should return null when thread creation fails', async () => {
      const completedForum = createMockForum({
        name: 'tasks-test',
        type: ChannelType.GuildForum
      });
      completedForum.threads.create.mockRejectedValue(new Error('Thread create failed'));

      const completedCategory = createMockCategory({
        id: 'category-completed',
        children: [['forum', completedForum]]
      });
      const guild = createTestGuild({
        channels: [['category-completed', completedCategory]]
      });

      const ticketInfo = { summary: 'Fail Thread', assignee: { displayName: 'test' } };
      const approver = { tag: 'pm#0000' };

      const result = await createCompletedTaskThread(guild, 'KAN-666', ticketInfo, approver);

      expect(result).toBeNull();
    });
  });
});
