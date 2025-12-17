/**
 * Unit tests for formatters utility
 * Tests status mapping functions for emoji, label, and color
 */

const { getStatusEmoji, getStatusLabel, getStatusColor } = require('../../src/utils/formatters');
const { JIRA_STATUS, COLORS, STATUS_EMOJIS } = require('../../src/utils/constants');

describe('formatters', () => {
  describe('getStatusEmoji', () => {
    test('should return DONE emoji for "done" status', () => {
      expect(getStatusEmoji('done')).toBe(STATUS_EMOJIS.DONE);
    });

    test('should return DONE emoji for "Done" status (case insensitive)', () => {
      expect(getStatusEmoji('Done')).toBe(STATUS_EMOJIS.DONE);
    });

    test('should return DONE emoji for status containing "done"', () => {
      expect(getStatusEmoji('Task Done')).toBe(STATUS_EMOJIS.DONE);
    });

    test('should return IN_REVIEW emoji for "review" status', () => {
      expect(getStatusEmoji('review')).toBe(STATUS_EMOJIS.IN_REVIEW);
    });

    test('should return IN_REVIEW emoji for "In Review" status', () => {
      expect(getStatusEmoji('In Review')).toBe(STATUS_EMOJIS.IN_REVIEW);
    });

    test('should return IN_PROGRESS emoji for "progress" status', () => {
      expect(getStatusEmoji('progress')).toBe(STATUS_EMOJIS.IN_PROGRESS);
    });

    test('should return IN_PROGRESS emoji for "In Progress" status', () => {
      expect(getStatusEmoji('In Progress')).toBe(STATUS_EMOJIS.IN_PROGRESS);
    });

    test('should return TO_DO emoji for "to do" status', () => {
      expect(getStatusEmoji('to do')).toBe(STATUS_EMOJIS.TO_DO);
    });

    test('should return TO_DO emoji for "To Do" status', () => {
      expect(getStatusEmoji('To Do')).toBe(STATUS_EMOJIS.TO_DO);
    });

    test('should return DEFAULT emoji for unknown status', () => {
      expect(getStatusEmoji('unknown')).toBe(STATUS_EMOJIS.DEFAULT);
    });

    test('should return DEFAULT emoji for empty string', () => {
      expect(getStatusEmoji('')).toBe(STATUS_EMOJIS.DEFAULT);
    });

    test('should return DEFAULT emoji for null', () => {
      expect(getStatusEmoji(null)).toBe(STATUS_EMOJIS.DEFAULT);
    });

    test('should return DEFAULT emoji for undefined', () => {
      expect(getStatusEmoji(undefined)).toBe(STATUS_EMOJIS.DEFAULT);
    });

    // Priority tests - done should take precedence
    test('should prioritize "done" over other keywords', () => {
      expect(getStatusEmoji('done in review')).toBe(STATUS_EMOJIS.DONE);
    });
  });

  describe('getStatusLabel', () => {
    test('should return TO_DO label for "todo"', () => {
      expect(getStatusLabel('todo')).toBe(JIRA_STATUS.TO_DO);
    });

    test('should return IN_PROGRESS label for "inprogress"', () => {
      expect(getStatusLabel('inprogress')).toBe(JIRA_STATUS.IN_PROGRESS);
    });

    test('should return IN_REVIEW label for "inreview"', () => {
      expect(getStatusLabel('inreview')).toBe(JIRA_STATUS.IN_REVIEW);
    });

    test('should return DONE label for "done"', () => {
      expect(getStatusLabel('done')).toBe(JIRA_STATUS.DONE);
    });

    test('should return input unchanged for unknown status', () => {
      expect(getStatusLabel('unknown')).toBe('unknown');
    });

    test('should return input unchanged for empty string', () => {
      expect(getStatusLabel('')).toBe('');
    });

    test('should return input unchanged for custom status', () => {
      expect(getStatusLabel('blocked')).toBe('blocked');
    });
  });

  describe('getStatusColor', () => {
    test('should return TO_DO color for "todo"', () => {
      expect(getStatusColor('todo')).toBe(COLORS.TO_DO);
    });

    test('should return IN_PROGRESS color for "inprogress"', () => {
      expect(getStatusColor('inprogress')).toBe(COLORS.IN_PROGRESS);
    });

    test('should return IN_REVIEW color for "inreview"', () => {
      expect(getStatusColor('inreview')).toBe(COLORS.IN_REVIEW);
    });

    test('should return DONE color for "done"', () => {
      expect(getStatusColor('done')).toBe(COLORS.DONE);
    });

    test('should return TO_DO color as default for unknown status', () => {
      expect(getStatusColor('unknown')).toBe(COLORS.TO_DO);
    });

    test('should return TO_DO color as default for empty string', () => {
      expect(getStatusColor('')).toBe(COLORS.TO_DO);
    });
  });
});
