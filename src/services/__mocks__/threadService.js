/**
 * Manual mock for threadService
 * Provides mock implementations for thread operations
 */

const findTicketThread = jest.fn().mockResolvedValue(null);

const deleteThreadWithDelay = jest.fn();

const archiveThread = jest.fn().mockResolvedValue(true);

const archiveThreadWithDelay = jest.fn();

const unarchiveThread = jest.fn().mockResolvedValue(true);

module.exports = {
  findTicketThread,
  deleteThreadWithDelay,
  archiveThread,
  archiveThreadWithDelay,
  unarchiveThread
};
