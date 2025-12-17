module.exports = {
  testEnvironment: 'node',
  coverageThreshold: {
    // Per-file thresholds for tested services/utils
    'src/services/jiraParserService.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    'src/services/n8nService.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    'src/services/userLookupService.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    'src/services/threadService.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    'src/services/forumService.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    'src/services/taskManagementService.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    'src/utils/validators.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    'src/utils/constants.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    'src/utils/formatters.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    'src/utils/errors.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    'src/handlers/reactionHandler.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    'src/handlers/ticketHandlers.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  collectCoverageFrom: [
    'src/services/**/*.js',
    'src/utils/**/*.js',
    'src/handlers/**/*.js',
    '!**/node_modules/**',
    '!**/__mocks__/**'
  ],
  setupFilesAfterEnv: ['jest-extended/all'],
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true
};
