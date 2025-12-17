# Jira-Discord Integration for seed-1 Project

This integration connects your Jira project (KAN) to Discord, providing:
1. **Automatic ticket notifications** in Discord channels based on labels
2. **Reaction-based ticket assignment** - react with checkmark to claim a ticket
3. **User registration** via `/register` slash command
4. **Task workflow management** - submit for review, PM approval/denial, completion tracking

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Jira        │────▶│      n8n        │────▶│    Discord      │
│  (Webhooks)     │     │  (Workflows)    │     │     Bot         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Project Structure

```
discord-bot/
├── index.js              # Bootstrap and client setup
├── deploy-commands.js    # Slash command deployment
├── commands/
│   └── utility/          # Slash commands
├── src/
│   ├── config.js         # Configuration management
│   ├── services/         # Business logic services
│   ├── handlers/         # Event handlers
│   ├── state/            # State management
│   └── utils/            # Utilities and helpers
└── tests/                # Unit tests
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

### Required

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Bot authentication token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application ID from Discord Developer Portal |
| `DISCORD_GUILD_ID` | Server ID where the bot operates |

### Optional

| Variable | Description |
|----------|-------------|
| `N8N_BASE_URL` | n8n instance URL for webhook calls |
| `JIRA_BASE_URL` | Jira instance URL for ticket links |
| `CHANNEL_CODE_UNASSIGNED` | Forum channel ID for code tickets |
| `CHANNEL_ART_UNASSIGNED` | Forum channel ID for art tickets |
| `CHANNEL_AUDIO_UNASSIGNED` | Forum channel ID for audio tickets |
| `CHANNEL_TASKS_FOR_REVIEW` | Forum channel ID for PM review queue |
| `CHANNEL_TICKET_NOTIFS` | Channel ID for ticket notifications |
| `CATEGORY_WORKING_TICKETS` | Category ID for user working ticket forums |
| `CATEGORY_COMPLETED_TASKS` | Category ID for completed task threads |
| `ROLE_PM` | Role ID for Project Managers |
| `LOG_LEVEL` | Logging verbosity: `debug`, `info`, `warn`, `error` |

## Service Layer

| Service | Purpose |
|---------|---------|
| `forumService` | Manages Discord forum and thread creation for tasks |
| `threadService` | Thread search and lifecycle operations |
| `userLookupService` | 3-tier Discord user discovery (username, permissions, thread search) |
| `n8nService` | Centralized n8n webhook client with retry logic |
| `jiraParserService` | Converts Jira descriptions to Discord markdown |
| `taskManagementService` | Task lifecycle orchestration (review, approve, deny, quit) |

## Discord Commands

### User Registration

| Command | Description |
|---------|-------------|
| `/register jira_email:<email>` | Link your Discord to your Jira account |
| `/unregister` | Unlink your Discord from Jira |
| `/whoami` | Check your current registration status |

### Task Management

| Command | Description |
|---------|-------------|
| `/task review` | Submit current task for PM review |
| `/task done` | Mark task as done (PM only) |
| `/task deny reason:<text>` | Deny task review with feedback (PM only) |
| `/task quit` | Unassign yourself from a task |
| `/tasks` | List your assigned tickets |
| `/tasks status:<filter>` | Filter by status: `todo`, `in_progress`, `in_review`, `done` |

## Setup Instructions

### Step 1: Install and Run Discord Bot

```bash
# Install dependencies
npm install

# Deploy slash commands to Discord
npm run deploy

# Start the bot
npm start
```

### Step 2: Configure n8n Workflows

1. Import the workflow templates into your n8n instance
2. Configure Jira credentials in the Jira-related nodes
3. Update webhook URLs to point to your n8n instance
4. Activate all workflows

### Step 3: Test the Integration

1. **Register a user:**
   - In Discord, type `/register jira_email:your@email.com`
   - The bot should confirm registration

2. **Claim a ticket:**
   - React to an unassigned ticket thread with checkmark
   - The ticket should be assigned to you in Jira
   - A private task thread is created in your user forum

3. **Submit for review:**
   - Use `/task review` in your task thread
   - Task moves to the PM review forum

## Ticket Routing Logic

| Label | Channels |
|-------|----------|
| `code` | #code-tickets |
| `art` | #art-tickets |
| `audio` | #audio-tickets |

## Running Tests

```bash
# Run test suite
npm test

# Run with coverage report
npm run test:coverage
```

**Coverage requirement: 80%** - All new features must include tests maintaining this threshold.

## Contributing

### Code Style
- Follow existing patterns in the codebase
- Use the service layer for business logic
- Keep handlers thin - delegate to services

### Testing Requirements
- All new features require unit tests
- Maintain 80% code coverage minimum
- Test edge cases and error handling

### PR Process
1. Create a feature branch from `main`
2. Write tests for your changes
3. Ensure all tests pass and coverage is maintained
4. Submit PR with clear description of changes

## Troubleshooting

### Bot not responding to reactions
- Check that the bot has `MESSAGE_CONTENT` intent enabled in Discord Developer Portal
- Ensure the bot has permissions to read message history and add reactions

### Tickets not appearing in Discord
- Verify the n8n workflow is active
- Check Jira webhook is configured correctly
- Ensure labels are exactly `code`, `art`, or `audio` (case-insensitive)

### Assignment failing
- Verify the user's Jira email is correct via `/whoami`
- Check that the user has permission to be assigned tickets in Jira
- Ensure the Jira API credentials in n8n are valid
- Check `.env` configuration is correct

### Commands not working
- Ensure commands are deployed: `npm run deploy`
- Check bot has slash command permissions in the server

## Security Note

The `.env` file contains sensitive credentials including your Discord bot token. Keep this file secure and never commit it to version control. The `.gitignore` is configured to exclude it.

---

Created for the seed-1 game development project at Tidal Studios.
