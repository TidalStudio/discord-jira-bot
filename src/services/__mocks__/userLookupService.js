/**
 * Mock for userLookupService
 * Used by taskManagementService tests
 */

const lookupDiscordUser = jest.fn().mockResolvedValue({
  discordUserId: null,
  discordUser: null
});

const findUserForum = jest.fn().mockResolvedValue({
  userForum: null,
  ticketThread: null
});

module.exports = {
  lookupDiscordUser,
  findUserForum
};
