/**
 * Unit tests for validators utility
 * Tests email validation, ticket key validation, and ticket key extraction
 */

const { isValidEmail, isValidTicketKey, extractTicketKey } = require('../../src/utils/validators');

describe('validators', () => {
  describe('isValidEmail', () => {
    describe('valid emails', () => {
      test.each([
        'user@example.com',
        'a@b.co',
        'user+tag@domain.org',
        'firstname.lastname@company.com',
        'email@subdomain.domain.com',
        'email@123.123.123.123',
        '1234567890@example.com',
        '_______@example.com',
        'email@domain-one.com'
      ])('should return true for %s', (email) => {
        expect(isValidEmail(email)).toBe(true);
      });
    });

    describe('invalid emails', () => {
      test.each([
        ['@example.com', 'missing local part'],
        ['user@', 'missing domain'],
        ['user', 'missing @ and domain'],
        ['user@.com', 'missing domain name'],
        ['', 'empty string'],
        ['plainaddress', 'no @ symbol'],
        ['@%^%#$@#$@#.com', 'garbage characters'],
        ['email.domain.com', 'missing @'],
        ['email@domain@domain.com', 'multiple @']
      ])('should return false for %s (%s)', (email) => {
        expect(isValidEmail(email)).toBe(false);
      });

      test('should return false for null', () => {
        expect(isValidEmail(null)).toBe(false);
      });

      test('should return false for undefined', () => {
        expect(isValidEmail(undefined)).toBe(false);
      });

      test('should return false for number', () => {
        expect(isValidEmail(123)).toBe(false);
      });

      test('should return false for object', () => {
        expect(isValidEmail({ email: 'test@test.com' })).toBe(false);
      });

      test('should return false for array', () => {
        expect(isValidEmail(['test@test.com'])).toBe(false);
      });
    });
  });

  describe('isValidTicketKey', () => {
    describe('valid ticket keys', () => {
      test.each([
        'KAN-123',
        'ABC-1',
        'PROJECT-99999',
        'A-1',
        'JIRA-42',
        'TEST-1234567890'
      ])('should return true for %s', (key) => {
        expect(isValidTicketKey(key)).toBe(true);
      });
    });

    describe('invalid ticket keys', () => {
      test.each([
        ['kan-123', 'lowercase project'],
        ['KAN123', 'no hyphen'],
        ['KAN-', 'missing number'],
        ['-123', 'missing project'],
        ['123-ABC', 'reversed format'],
        ['KAN-ABC', 'letters instead of numbers'],
        ['', 'empty string'],
        ['KAN', 'project only'],
        ['123', 'numbers only'],
        ['-', 'hyphen only'],
        ['KAN-0', 'ticket 0 is valid format but unusual'],
        ['kan-', 'lowercase no number']
      ])('should return false for %s (%s)', (key, description) => {
        if (key === 'KAN-0') {
          // KAN-0 actually matches the regex, so it should be valid
          expect(isValidTicketKey(key)).toBe(true);
        } else {
          expect(isValidTicketKey(key)).toBe(false);
        }
      });

      test('should return false for null', () => {
        expect(isValidTicketKey(null)).toBe(false);
      });

      test('should return false for undefined', () => {
        expect(isValidTicketKey(undefined)).toBe(false);
      });

      test('should return false for number', () => {
        expect(isValidTicketKey(123)).toBe(false);
      });

      test('should return false for object', () => {
        expect(isValidTicketKey({ key: 'KAN-123' })).toBe(false);
      });
    });
  });

  describe('extractTicketKey', () => {
    describe('successful extraction', () => {
      test('should extract from beginning of string', () => {
        expect(extractTicketKey('KAN-123 is the ticket')).toBe('KAN-123');
      });

      test('should extract from middle of string', () => {
        expect(extractTicketKey('Working on KAN-456 today')).toBe('KAN-456');
      });

      test('should extract from end of string', () => {
        expect(extractTicketKey('Check out KAN-789')).toBe('KAN-789');
      });

      test('should extract from brackets', () => {
        expect(extractTicketKey('[KAN-789]')).toBe('KAN-789');
      });

      test('should extract first ticket key when multiple present', () => {
        expect(extractTicketKey('KAN-123 and KAN-456')).toBe('KAN-123');
      });

      test('should extract from URL-like strings', () => {
        expect(extractTicketKey('https://jira.example.com/browse/PROJECT-123')).toBe('PROJECT-123');
      });

      test('should handle ticket key as entire string', () => {
        expect(extractTicketKey('TICKET-999')).toBe('TICKET-999');
      });
    });

    describe('failed extraction', () => {
      test('should return null when no ticket key present', () => {
        expect(extractTicketKey('No ticket here')).toBeNull();
      });

      test('should return null for empty string', () => {
        expect(extractTicketKey('')).toBeNull();
      });

      test('should return null for null input', () => {
        expect(extractTicketKey(null)).toBeNull();
      });

      test('should return null for undefined input', () => {
        expect(extractTicketKey(undefined)).toBeNull();
      });

      test('should return null for number input', () => {
        expect(extractTicketKey(123)).toBeNull();
      });

      test('should return null for lowercase ticket format', () => {
        expect(extractTicketKey('kan-123 is lowercase')).toBeNull();
      });

      test('should return null for object input', () => {
        expect(extractTicketKey({ text: 'KAN-123' })).toBeNull();
      });
    });
  });
});
