/**
 * Unit tests for constants utility
 * Sanity checks to ensure constant values are properly defined
 */

const { EMOJIS, JIRA_STATUS, COLORS, STATUS_EMOJIS, TIMEOUTS, FORUM } = require('../../src/utils/constants');

describe('constants', () => {
  describe('EMOJIS', () => {
    test('should have CHECKMARKS array', () => {
      expect(EMOJIS.CHECKMARKS).toBeArray();
      expect(EMOJIS.CHECKMARKS).not.toBeEmpty();
    });

    test('CHECKMARKS should contain common checkmark emojis', () => {
      expect(EMOJIS.CHECKMARKS).toContain('✅');
      expect(EMOJIS.CHECKMARKS).toContain('white_check_mark');
    });

    test('should have DENY array', () => {
      expect(EMOJIS.DENY).toBeArray();
      expect(EMOJIS.DENY).not.toBeEmpty();
    });

    test('DENY should contain common deny emojis', () => {
      expect(EMOJIS.DENY).toContain('❌');
      expect(EMOJIS.DENY).toContain('x');
    });
  });

  describe('JIRA_STATUS', () => {
    test('should have TO_DO status', () => {
      expect(JIRA_STATUS.TO_DO).toBe('To Do');
    });

    test('should have IN_PROGRESS status', () => {
      expect(JIRA_STATUS.IN_PROGRESS).toBe('In Progress');
    });

    test('should have IN_REVIEW status', () => {
      expect(JIRA_STATUS.IN_REVIEW).toBe('In Review');
    });

    test('should have DONE status', () => {
      expect(JIRA_STATUS.DONE).toBe('Done');
    });

    test('should have exactly 4 statuses', () => {
      expect(Object.keys(JIRA_STATUS)).toHaveLength(4);
    });
  });

  describe('COLORS', () => {
    test('all colors should be valid hex numbers', () => {
      Object.values(COLORS).forEach(color => {
        expect(typeof color).toBe('number');
        expect(color).toBeGreaterThanOrEqual(0);
        expect(color).toBeLessThanOrEqual(0xFFFFFF);
      });
    });

    test('should have TO_DO color (blue)', () => {
      expect(COLORS.TO_DO).toBe(0x3498db);
    });

    test('should have IN_PROGRESS color (orange)', () => {
      expect(COLORS.IN_PROGRESS).toBe(0xf39c12);
    });

    test('should have IN_REVIEW color (purple)', () => {
      expect(COLORS.IN_REVIEW).toBe(0x9b59b6);
    });

    test('should have DONE color (green)', () => {
      expect(COLORS.DONE).toBe(0x2ecc71);
    });

    test('should have SUCCESS color', () => {
      expect(COLORS.SUCCESS).toBe(0x00ff00);
    });
  });

  describe('STATUS_EMOJIS', () => {
    test('should have DONE emoji', () => {
      expect(STATUS_EMOJIS.DONE).toBe('✅');
    });

    test('should have IN_REVIEW emoji', () => {
      expect(STATUS_EMOJIS.IN_REVIEW).toBe('🔍');
    });

    test('should have IN_PROGRESS emoji', () => {
      expect(STATUS_EMOJIS.IN_PROGRESS).toBe('🔄');
    });

    test('should have TO_DO emoji', () => {
      expect(STATUS_EMOJIS.TO_DO).toBe('📋');
    });

    test('should have DEFAULT emoji', () => {
      expect(STATUS_EMOJIS.DEFAULT).toBe('📌');
    });
  });

  describe('TIMEOUTS', () => {
    test('all timeouts should be positive numbers', () => {
      Object.values(TIMEOUTS).forEach(timeout => {
        expect(typeof timeout).toBe('number');
        expect(timeout).toBeGreaterThan(0);
      });
    });

    test('should have SHORT timeout', () => {
      expect(TIMEOUTS.THREAD_DELETE_SHORT).toBe(2000);
    });

    test('should have MEDIUM timeout', () => {
      expect(TIMEOUTS.THREAD_DELETE_MEDIUM).toBe(2500);
    });

    test('should have LONG timeout', () => {
      expect(TIMEOUTS.THREAD_DELETE_LONG).toBe(3000);
    });

    test('timeouts should be in ascending order', () => {
      expect(TIMEOUTS.THREAD_DELETE_SHORT).toBeLessThan(TIMEOUTS.THREAD_DELETE_MEDIUM);
      expect(TIMEOUTS.THREAD_DELETE_MEDIUM).toBeLessThan(TIMEOUTS.THREAD_DELETE_LONG);
    });
  });

  describe('FORUM', () => {
    test('should have AUTO_ARCHIVE_DURATION', () => {
      expect(FORUM.AUTO_ARCHIVE_DURATION).toBe(10080);
    });

    test('AUTO_ARCHIVE_DURATION should equal 7 days in minutes', () => {
      const sevenDaysInMinutes = 7 * 24 * 60;
      expect(FORUM.AUTO_ARCHIVE_DURATION).toBe(sevenDaysInMinutes);
    });
  });
});
