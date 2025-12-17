/**
 * Unit tests for custom error classes
 * Tests TicketError, PermissionError, and WebhookError
 */

const { TicketError, PermissionError, WebhookError } = require('../../src/utils/errors');

describe('errors', () => {
  describe('TicketError', () => {
    test('should create error with message only', () => {
      const error = new TicketError('Something went wrong');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TicketError);
      expect(error.message).toBe('Something went wrong');
      expect(error.name).toBe('TicketError');
      expect(error.ticketKey).toBeNull();
    });

    test('should create error with message and ticketKey', () => {
      const error = new TicketError('Ticket not found', 'KAN-123');

      expect(error.message).toBe('Ticket not found');
      expect(error.ticketKey).toBe('KAN-123');
    });

    test('should have correct stack trace', () => {
      const error = new TicketError('Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('TicketError');
    });
  });

  describe('PermissionError', () => {
    test('should create error with message only', () => {
      const error = new PermissionError('Access denied');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TicketError);
      expect(error).toBeInstanceOf(PermissionError);
      expect(error.message).toBe('Access denied');
      expect(error.name).toBe('PermissionError');
      expect(error.requiredRole).toBeNull();
    });

    test('should create error with message and requiredRole', () => {
      const error = new PermissionError('Only PMs can approve', 'pm');

      expect(error.message).toBe('Only PMs can approve');
      expect(error.requiredRole).toBe('pm');
    });

    test('should inherit from TicketError', () => {
      const error = new PermissionError('Test');

      expect(error).toBeInstanceOf(TicketError);
    });

    test('should have ticketKey as null from parent', () => {
      const error = new PermissionError('Test', 'admin');

      // PermissionError passes message only to parent, so ticketKey defaults to null
      expect(error.ticketKey).toBeNull();
    });
  });

  describe('WebhookError', () => {
    test('should create error with message only', () => {
      const error = new WebhookError('Webhook failed');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TicketError);
      expect(error).toBeInstanceOf(WebhookError);
      expect(error.message).toBe('Webhook failed');
      expect(error.name).toBe('WebhookError');
      expect(error.ticketKey).toBeNull();
      expect(error.endpoint).toBeNull();
    });

    test('should create error with message and ticketKey', () => {
      const error = new WebhookError('Webhook failed', 'KAN-456');

      expect(error.message).toBe('Webhook failed');
      expect(error.ticketKey).toBe('KAN-456');
      expect(error.endpoint).toBeNull();
    });

    test('should create error with all parameters', () => {
      const error = new WebhookError('Webhook failed', 'KAN-789', '/webhook/assign-ticket');

      expect(error.message).toBe('Webhook failed');
      expect(error.ticketKey).toBe('KAN-789');
      expect(error.endpoint).toBe('/webhook/assign-ticket');
    });

    test('should inherit from TicketError', () => {
      const error = new WebhookError('Test');

      expect(error).toBeInstanceOf(TicketError);
    });
  });

  describe('error catching', () => {
    test('should be catchable as TicketError', () => {
      const errors = [
        new TicketError('base'),
        new PermissionError('permission'),
        new WebhookError('webhook')
      ];

      for (const error of errors) {
        expect(error).toBeInstanceOf(TicketError);
      }
    });

    test('should be distinguishable by name', () => {
      const ticketError = new TicketError('test');
      const permError = new PermissionError('test');
      const webhookError = new WebhookError('test');

      expect(ticketError.name).toBe('TicketError');
      expect(permError.name).toBe('PermissionError');
      expect(webhookError.name).toBe('WebhookError');
    });
  });
});
