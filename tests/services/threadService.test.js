/**
 * Unit tests for threadService
 * Tests thread search, deletion, and archiving operations
 * Uses mocked Discord.js objects
 */

// Mock the logger to suppress output during tests
jest.mock('../../src/utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

const {
  createMockForum,
  createMockThread,
  createMockCollection
} = require('../../__mocks__/discord.js');

const {
  findTicketThread,
  deleteThreadWithDelay,
  archiveThread,
  archiveThreadWithDelay,
  unarchiveThread
} = require('../../src/services/threadService');

describe('threadService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('findTicketThread', () => {
    test('should return null when forum is null', async () => {
      const result = await findTicketThread(null, 'KAN-123');
      expect(result).toBeNull();
    });

    test('should return null when forum is undefined', async () => {
      const result = await findTicketThread(undefined, 'KAN-123');
      expect(result).toBeNull();
    });

    test('should find thread in active threads', async () => {
      const mockThread = createMockThread({ name: 'KAN-123: Test Task' });
      const activeThreads = createMockCollection([['thread-123', mockThread]]);
      const forum = createMockForum({ activeThreads });

      const result = await findTicketThread(forum, 'KAN-123');

      expect(result).toBe(mockThread);
      expect(forum.threads.fetchActive).toHaveBeenCalled();
    });

    test('should find thread in archived threads when not in active', async () => {
      const mockThread = createMockThread({ name: 'KAN-456: Archived Task', archived: true });
      const activeThreads = createMockCollection();
      const archivedThreads = createMockCollection([['thread-456', mockThread]]);
      const forum = createMockForum({ activeThreads, archivedThreads });

      const result = await findTicketThread(forum, 'KAN-456');

      expect(result).toBe(mockThread);
      expect(forum.threads.fetchActive).toHaveBeenCalled();
      expect(forum.threads.fetchArchived).toHaveBeenCalled();
    });

    test('should return null when thread not found in either', async () => {
      const forum = createMockForum();

      const result = await findTicketThread(forum, 'KAN-999');

      expect(result).toBeNull();
    });

    test('should match thread by ticket key prefix', async () => {
      const thread1 = createMockThread({ name: 'KAN-100: First Task' });
      const thread2 = createMockThread({ name: 'KAN-123: Target Task' });
      const thread3 = createMockThread({ name: 'KAN-200: Third Task' });
      const activeThreads = createMockCollection([
        ['thread-1', thread1],
        ['thread-2', thread2],
        ['thread-3', thread3]
      ]);
      const forum = createMockForum({ activeThreads });

      const result = await findTicketThread(forum, 'KAN-123');

      expect(result).toBe(thread2);
    });

    test('should handle fetch error gracefully', async () => {
      const forum = createMockForum();
      forum.threads.fetchActive.mockRejectedValue(new Error('API Error'));

      const result = await findTicketThread(forum, 'KAN-123');

      expect(result).toBeNull();
    });
  });

  describe('deleteThreadWithDelay', () => {
    test('should not throw when thread is null', () => {
      expect(() => deleteThreadWithDelay(null, 'test reason')).not.toThrow();
    });

    test('should not throw when thread is undefined', () => {
      expect(() => deleteThreadWithDelay(undefined, 'test reason')).not.toThrow();
    });

    test('should delete thread after default delay', async () => {
      const mockThread = createMockThread({ name: 'KAN-123' });

      deleteThreadWithDelay(mockThread, 'Task completed');

      // Thread should not be deleted immediately
      expect(mockThread.delete).not.toHaveBeenCalled();

      // Advance timers by default delay (2000ms)
      await jest.advanceTimersByTimeAsync(2000);

      expect(mockThread.delete).toHaveBeenCalledWith('Task completed');
    });

    test('should delete thread after custom delay', async () => {
      const mockThread = createMockThread({ name: 'KAN-123' });

      deleteThreadWithDelay(mockThread, 'Custom delay', 5000);

      // Should not be deleted before delay
      await jest.advanceTimersByTimeAsync(4999);
      expect(mockThread.delete).not.toHaveBeenCalled();

      // Should be deleted after delay
      await jest.advanceTimersByTimeAsync(1);
      expect(mockThread.delete).toHaveBeenCalled();
    });

    test('should archive thread as fallback when delete fails', async () => {
      const mockThread = createMockThread({ name: 'KAN-123' });
      mockThread.delete.mockRejectedValue(new Error('Cannot delete'));

      deleteThreadWithDelay(mockThread, 'test', 1000, true);

      await jest.advanceTimersByTimeAsync(1000);

      expect(mockThread.delete).toHaveBeenCalled();
      expect(mockThread.setArchived).toHaveBeenCalledWith(true);
    });

    test('should not archive as fallback when option is false', async () => {
      const mockThread = createMockThread({ name: 'KAN-123' });
      mockThread.delete.mockRejectedValue(new Error('Cannot delete'));

      deleteThreadWithDelay(mockThread, 'test', 1000, false);

      await jest.advanceTimersByTimeAsync(1000);

      expect(mockThread.delete).toHaveBeenCalled();
      expect(mockThread.setArchived).not.toHaveBeenCalled();
    });
  });

  describe('archiveThread', () => {
    test('should return false when thread is null', async () => {
      const result = await archiveThread(null);
      expect(result).toBe(false);
    });

    test('should return false when thread is undefined', async () => {
      const result = await archiveThread(undefined);
      expect(result).toBe(false);
    });

    test('should archive thread successfully', async () => {
      const mockThread = createMockThread({ name: 'KAN-123' });

      const result = await archiveThread(mockThread);

      expect(result).toBe(true);
      expect(mockThread.setArchived).toHaveBeenCalledWith(true);
    });

    test('should return false when archiving fails', async () => {
      const mockThread = createMockThread({ name: 'KAN-123' });
      mockThread.setArchived.mockRejectedValue(new Error('Cannot archive'));

      const result = await archiveThread(mockThread);

      expect(result).toBe(false);
    });
  });

  describe('archiveThreadWithDelay', () => {
    test('should not throw when thread is null', () => {
      expect(() => archiveThreadWithDelay(null)).not.toThrow();
    });

    test('should archive thread after default delay', async () => {
      const mockThread = createMockThread({ name: 'KAN-123' });

      archiveThreadWithDelay(mockThread);

      // Thread should not be archived immediately
      expect(mockThread.setArchived).not.toHaveBeenCalled();

      // Advance timers by default delay
      await jest.advanceTimersByTimeAsync(2000);

      expect(mockThread.setArchived).toHaveBeenCalledWith(true);
    });

    test('should archive thread after custom delay', async () => {
      const mockThread = createMockThread({ name: 'KAN-123' });

      archiveThreadWithDelay(mockThread, 3000);

      await jest.advanceTimersByTimeAsync(2999);
      expect(mockThread.setArchived).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      expect(mockThread.setArchived).toHaveBeenCalledWith(true);
    });
  });

  describe('unarchiveThread', () => {
    test('should return false when thread is null', async () => {
      const result = await unarchiveThread(null);
      expect(result).toBe(false);
    });

    test('should return false when thread is undefined', async () => {
      const result = await unarchiveThread(undefined);
      expect(result).toBe(false);
    });

    test('should unarchive thread successfully', async () => {
      const mockThread = createMockThread({ name: 'KAN-123', archived: true });

      const result = await unarchiveThread(mockThread);

      expect(result).toBe(true);
      expect(mockThread.setArchived).toHaveBeenCalledWith(false);
    });

    test('should return false when unarchiving fails', async () => {
      const mockThread = createMockThread({ name: 'KAN-123', archived: true });
      mockThread.setArchived.mockRejectedValue(new Error('Cannot unarchive'));

      const result = await unarchiveThread(mockThread);

      expect(result).toBe(false);
    });
  });
});
