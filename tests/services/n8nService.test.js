/**
 * Unit tests for n8nService
 * Tests webhook client with retry logic, request/response handling
 * Uses mocked global.fetch for HTTP requests
 */

// Mock the config before requiring the service
jest.mock('../../src/config', () => ({
  n8nBaseUrl: 'https://n8n.example.com',
  webhooks: {
    assignTicket: '/webhook/assign-ticket',
    registerUser: '/webhook/register-user',
    moveTicket: '/webhook/move-ticket',
    lookupUser: '/webhook/lookup-user',
    quitTicket: '/webhook/quit-ticket',
    getUserTasks: '/webhook/get-user-tasks'
  }
}));

// Mock the logger to suppress output during tests
jest.mock('../../src/utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

const n8nService = require('../../src/services/n8nService');

describe('n8nService', () => {
  let mockFetch;

  beforeEach(() => {
    // Reset fetch mock before each test
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  /**
   * Helper to create a successful fetch response
   */
  function createSuccessResponse(data) {
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ success: true, ...data })
    });
  }

  /**
   * Helper to create a failed fetch response
   */
  function createErrorResponse(status, error) {
    return Promise.resolve({
      ok: false,
      status,
      statusText: 'Error',
      json: () => Promise.resolve({ success: false, error })
    });
  }

  describe('retry logic', () => {
    test('should succeed on first attempt', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({ data: 'test' }));

      const result = await n8nService.lookupUser('test@example.com');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('should retry on failure and succeed on second attempt', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockReturnValueOnce(createSuccessResponse({ data: 'test' }));

      const promise = n8nService.lookupUser('test@example.com');

      // First call fails immediately
      await jest.advanceTimersByTimeAsync(0);

      // Wait for retry delay (1 second for first retry)
      await jest.advanceTimersByTimeAsync(1000);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should retry with exponential backoff', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockReturnValueOnce(createSuccessResponse({ data: 'test' }));

      const promise = n8nService.lookupUser('test@example.com');

      // First call fails
      await jest.advanceTimersByTimeAsync(0);

      // Wait for first retry delay (1 second)
      await jest.advanceTimersByTimeAsync(1000);

      // Wait for second retry delay (2 seconds)
      await jest.advanceTimersByTimeAsync(2000);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test('should fail after max retry attempts', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent error'));

      const promise = n8nService.lookupUser('test@example.com');

      // First attempt
      await jest.advanceTimersByTimeAsync(0);
      // Second attempt after 1s delay
      await jest.advanceTimersByTimeAsync(1000);
      // Third attempt after 2s delay
      await jest.advanceTimersByTimeAsync(2000);

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('failed after 3 attempts');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('request handling', () => {
    test('should send POST request with JSON body', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({}));

      await n8nService.lookupUser('test@example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/lookup-user',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jiraEmail: 'test@example.com' })
        })
      );
    });

    test('should send GET request with query params', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({ tasks: [] }));

      await n8nService.getUserTasks('user-123', 'inprogress');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/get-user-tasks?discordUserId=user-123&status=inprogress',
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    test('should send DELETE request with body', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({}));

      await n8nService.unregisterUser('user-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/register-user',
        expect.objectContaining({
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ discordUserId: 'user-123', action: 'unregister' })
        })
      );
    });
  });

  describe('response handling', () => {
    test('should handle successful response', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({ customField: 'value' }));

      const result = await n8nService.lookupUser('test@example.com');

      expect(result.success).toBe(true);
      expect(result.customField).toBe('value');
    });

    test('should handle HTTP error response', async () => {
      mockFetch.mockReturnValue(createErrorResponse(400, 'Bad Request'));

      const promise = n8nService.lookupUser('test@example.com');

      // Advance through all retries
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Bad Request');
    });

    test('should handle JSON parse error', async () => {
      mockFetch.mockReturnValue(Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Invalid JSON'))
      }));

      const promise = n8nService.lookupUser('test@example.com');

      // Advance through all retries
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });
  });

  describe('assignTicket', () => {
    test('should send correct payload', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({}));

      await n8nService.assignTicket('user-123', 'testuser', 'testuser#1234', 'KAN-123', 'thread-456');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/assign-ticket',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            discordUserId: 'user-123',
            discordUsername: 'testuser',
            discordTag: 'testuser#1234',
            jiraTicketKey: 'KAN-123',
            threadId: 'thread-456',
            action: 'claim'
          })
        })
      );
    });
  });

  describe('moveTicket', () => {
    test('should send basic payload', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({}));

      await n8nService.moveTicket('KAN-123', 'In Progress');

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body.jiraTicketKey).toBe('KAN-123');
      expect(body.targetStatus).toBe('In Progress');
    });

    test('should include optional parameters when provided', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({}));

      await n8nService.moveTicket('KAN-123', 'Done', {
        approvedBy: 'pm-user',
        submittedBy: 'dev-user',
        discordUserId: 'user-123'
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body.approvedBy).toBe('pm-user');
      expect(body.submittedBy).toBe('dev-user');
      expect(body.discordUserId).toBe('user-123');
    });

    test('should not include undefined optional parameters', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({}));

      await n8nService.moveTicket('KAN-123', 'In Review', { submittedBy: 'dev-user' });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body).not.toHaveProperty('approvedBy');
      expect(body).not.toHaveProperty('deniedBy');
      expect(body.submittedBy).toBe('dev-user');
    });
  });

  describe('registerUser', () => {
    test('should include timestamp in payload', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({}));

      const beforeTime = new Date().toISOString();
      await n8nService.registerUser('user-123', 'testuser', 'test@example.com');
      const afterTime = new Date().toISOString();

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body.discordUserId).toBe('user-123');
      expect(body.discordUsername).toBe('testuser');
      expect(body.jiraEmail).toBe('test@example.com');
      expect(body.registeredAt).toBeDefined();
      // Verify timestamp is recent (within test execution window)
      expect(body.registeredAt >= beforeTime).toBe(true);
    });
  });

  describe('unregisterUser', () => {
    test('should use DELETE method', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({}));

      await n8nService.unregisterUser('user-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('lookupUser', () => {
    test('should send email in body', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({ discordId: 'user-456' }));

      const result = await n8nService.lookupUser('test@example.com');

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body.jiraEmail).toBe('test@example.com');
      expect(result.discordId).toBe('user-456');
    });
  });

  describe('lookupUserByDiscordId', () => {
    test('should send Discord ID as query param', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({
        jiraEmail: 'test@example.com',
        registeredAt: '2024-01-01T00:00:00Z'
      }));

      await n8nService.lookupUserByDiscordId('user-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/register-user?discordUserId=user-123&action=lookup',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('quitTicket', () => {
    test('should send correct payload', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({}));

      await n8nService.quitTicket('KAN-123', 'user-123', 'testuser');

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body.jiraTicketKey).toBe('KAN-123');
      expect(body.discordUserId).toBe('user-123');
      expect(body.discordUsername).toBe('testuser');
    });
  });

  describe('getUserTasks', () => {
    test('should send without status filter', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({ tasks: [] }));

      await n8nService.getUserTasks('user-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/get-user-tasks?discordUserId=user-123',
        expect.any(Object)
      );
    });

    test('should send with status filter', async () => {
      mockFetch.mockReturnValue(createSuccessResponse({ tasks: [] }));

      await n8nService.getUserTasks('user-123', 'done');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/get-user-tasks?discordUserId=user-123&status=done',
        expect.any(Object)
      );
    });

    test('should return tasks array', async () => {
      const mockTasks = [
        { key: 'KAN-1', summary: 'Task 1', status: 'In Progress' },
        { key: 'KAN-2', summary: 'Task 2', status: 'Done' }
      ];
      mockFetch.mockReturnValue(createSuccessResponse({ tasks: mockTasks }));

      const result = await n8nService.getUserTasks('user-123');

      expect(result.success).toBe(true);
      expect(result.tasks).toEqual(mockTasks);
    });
  });
});
