/**
 * Manual mock for discord.js
 * Provides mock enums and factory functions for testing
 */

const ChannelType = {
  GuildText: 0,
  DM: 1,
  GuildVoice: 2,
  GroupDM: 3,
  GuildCategory: 4,
  GuildAnnouncement: 5,
  AnnouncementThread: 10,
  PublicThread: 11,
  PrivateThread: 12,
  GuildStageVoice: 13,
  GuildDirectory: 14,
  GuildForum: 15
};

const PermissionFlagsBits = {
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  ManageThreads: 1n << 34n,
  ManageMessages: 1n << 13n,
  ReadMessageHistory: 1n << 16n
};

/**
 * Create a mock Discord Collection
 * @param {Array} entries - Array of [key, value] pairs
 * @returns {Map} - Map with Discord Collection-like methods
 */
function createMockCollection(entries = []) {
  const map = new Map(entries);

  map.find = function(fn) {
    for (const [, value] of this) {
      if (fn(value)) return value;
    }
    return undefined;
  };

  map.filter = function(fn) {
    const result = createMockCollection();
    for (const [key, value] of this) {
      if (fn(value, key)) result.set(key, value);
    }
    return result;
  };

  map.first = function() {
    return this.values().next().value;
  };

  // Make map.cache refer to itself for compatibility
  map.cache = map;

  return map;
}

/**
 * Create a mock thread channel
 * @param {Object} options - Thread options
 * @returns {Object} - Mock thread channel
 */
function createMockThread(options = {}) {
  const mockStarterMessage = {
    id: 'starter-message-123',
    react: jest.fn().mockResolvedValue(undefined)
  };

  return {
    id: options.id || 'thread-123',
    name: options.name || 'Test Thread',
    archived: options.archived || false,
    type: ChannelType.PublicThread,
    delete: jest.fn().mockResolvedValue(undefined),
    setArchived: jest.fn().mockImplementation(function(archived) {
      this.archived = archived;
      return Promise.resolve(this);
    }),
    send: jest.fn().mockResolvedValue({ id: 'message-123' }),
    fetchStarterMessage: jest.fn().mockResolvedValue(mockStarterMessage),
    ...options
  };
}

/**
 * Create a mock forum channel
 * @param {Object} options - Forum options
 * @returns {Object} - Mock forum channel
 */
function createMockForum(options = {}) {
  const { activeThreads, archivedThreads, permissionOverwrites, ...restOptions } = options;
  const activeThreadsColl = activeThreads || createMockCollection();
  const archivedThreadsColl = archivedThreads || createMockCollection();

  return {
    id: restOptions.id || 'forum-123',
    name: restOptions.name || 'test-forum',
    type: ChannelType.GuildForum,
    threads: {
      fetchActive: jest.fn().mockResolvedValue({ threads: activeThreadsColl }),
      fetchArchived: jest.fn().mockResolvedValue({ threads: archivedThreadsColl }),
      create: jest.fn().mockImplementation((data) => {
        const thread = createMockThread({ name: data.name });
        return Promise.resolve(thread);
      }),
      cache: createMockCollection([...activeThreadsColl])
    },
    permissionOverwrites: {
      cache: createMockCollection(permissionOverwrites || [])
    },
    children: {
      cache: createMockCollection()
    },
    ...restOptions
  };
}

/**
 * Create a mock category channel
 * @param {Object} options - Category options
 * @returns {Object} - Mock category channel
 */
function createMockCategory(options = {}) {
  const { children, ...restOptions } = options;
  return {
    id: restOptions.id || 'category-123',
    name: restOptions.name || 'Test Category',
    type: ChannelType.GuildCategory,
    children: {
      cache: createMockCollection(children || [])
    },
    ...restOptions
  };
}

/**
 * Create a mock guild member
 * @param {Object} options - Member options
 * @returns {Object} - Mock guild member
 */
function createMockMember(options = {}) {
  return {
    id: options.id || 'user-123',
    user: {
      id: options.id || 'user-123',
      username: options.username || 'testuser',
      tag: options.tag || 'testuser#1234',
      ...options.user
    },
    displayName: options.displayName || options.username || 'testuser',
    roles: {
      cache: createMockCollection(options.roles || []),
      has: jest.fn().mockReturnValue(false)
    },
    ...options
  };
}

/**
 * Create a mock guild
 * @param {Object} options - Guild options
 * @returns {Object} - Mock guild
 */
function createMockGuild(options = {}) {
  const { channels, members, roles, ...restOptions } = options;
  const membersArr = members || [];

  return {
    id: restOptions.id || 'guild-123',
    name: restOptions.name || 'Test Guild',
    channels: {
      cache: createMockCollection(channels || []),
      create: jest.fn().mockImplementation((data) => {
        if (data.type === ChannelType.GuildForum) {
          return Promise.resolve(createMockForum({ name: data.name }));
        }
        return Promise.resolve({ id: 'new-channel', name: data.name, type: data.type });
      }),
      fetch: jest.fn()
    },
    members: {
      cache: createMockCollection(membersArr),
      fetch: jest.fn().mockImplementation((id) => {
        const member = membersArr.find(([key]) => key === id)?.[1];
        if (member) return Promise.resolve(member);
        return Promise.reject(new Error('Unknown Member'));
      })
    },
    roles: {
      cache: createMockCollection(roles || [])
    },
    ...restOptions
  };
}

/**
 * Create a mock permission overwrite
 * @param {Object} options - Overwrite options
 * @returns {Object} - Mock permission overwrite
 */
function createMockPermissionOverwrite(options = {}) {
  const { allow, deny, ...restOptions } = options;

  return {
    id: restOptions.id || 'user-123',
    allow: {
      has: jest.fn().mockImplementation((flag) => {
        return allow?.includes(flag) || false;
      }),
      bitfield: restOptions.allowBitfield || 0n
    },
    deny: {
      has: jest.fn().mockImplementation((flag) => {
        return deny?.includes(flag) || false;
      }),
      bitfield: restOptions.denyBitfield || 0n
    },
    ...restOptions
  };
}

module.exports = {
  ChannelType,
  PermissionFlagsBits,
  createMockCollection,
  createMockThread,
  createMockForum,
  createMockCategory,
  createMockMember,
  createMockGuild,
  createMockPermissionOverwrite
};
