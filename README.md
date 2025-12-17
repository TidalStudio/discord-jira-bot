# Jira-Discord Integration for seed-1 Project

This integration connects your Jira project (KAN) to Discord, providing:
1. **Automatic ticket notifications** in Discord channels based on labels
2. **Reaction-based ticket assignment** - react with ✅ to assign a ticket to yourself
3. **User registration** via `/register` slash command

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Jira        │────▶│      n8n        │────▶│    Discord      │
│  (Webhooks)     │     │  (3 workflows)  │     │  (Webhooks)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
┌─────────────────┐     ┌─────────────────┐
│  Discord Bot    │────▶│ JSON File Store │
│ (Reactions +    │     │ (User Mappings) │
│  Commands)      │     └─────────────────┘
└─────────────────┘
```

## Components

### 1. n8n Workflows

| Workflow | ID | Purpose |
|----------|-----|---------|
| Jira to Discord - Ticket Notifications | `vmEIbMH0HMiR7yS9` | Routes Jira events to Discord channels |
| Discord User Registration | `pd9iUuO5OzHG0Odr` | Handles `/register`, `/unregister`, `/whoami` |
| Discord Reaction - Assign Jira Ticket | `vN4Rs1XFOCJJ7zey` | Assigns tickets when users react with ✅ |

### 2. Discord Bot

Located in `/home/claude/discord-bot/`

**Features:**
- Listens for ✅ reactions on ticket messages
- Handles slash commands (`/register`, `/unregister`, `/whoami`)
- Forwards events to n8n webhooks

### 3. Discord Webhooks

| Channel | Webhook URL |
|---------|-------------|
| Code Tickets | `https://discord.com/api/webhooks/1448023647204675585/crPA6...` |
| Art Tickets | `https://discord.com/api/webhooks/1448023834274959453/hMXKO...` |
| Audio Tickets | `https://discord.com/api/webhooks/1448023907519955066/BBGp7...` |
| All Tickets | `https://discord.com/api/webhooks/1448024108616122459/q-MaO...` |

## Setup Instructions

### Step 1: Install and Run Discord Bot

```bash
cd /home/claude/discord-bot

# Install dependencies
npm install

# Deploy slash commands to Discord
npm run deploy

# Start the bot
npm start
```

### Step 2: Activate n8n Workflows

Go to your n8n instance at `https://fe73d70d9a56.ngrok-free.app` and:

1. Open each workflow
2. **Configure Jira credentials** in the "Jira to Discord - Ticket Notifications" workflow:
   - Click on the "Jira Trigger" node
   - Add your Jira Cloud credentials (email + API token)
3. **Configure Jira credentials** in the "Discord Reaction - Assign Jira Ticket" workflow:
   - Click on the "Assign Jira Ticket" node
   - Add your Jira Cloud credentials
4. **Activate all three workflows** by toggling them ON

### Step 3: Test the Integration

1. **Register a user:**
   - In Discord, type `/register jira_email:your@email.com`
   - The bot should confirm registration

2. **Create a test ticket in Jira:**
   - Create a ticket in the KAN project
   - Add a label: `code`, `art`, or `audio`
   - The ticket should appear in the corresponding Discord channel(s)

3. **Assign via reaction:**
   - React to a ticket message with ✅
   - The ticket should be assigned to you in Jira

## Ticket Routing Logic

| Label | Channels |
|-------|----------|
| `code` | #code-tickets, #all-tickets |
| `art` | #art-tickets, #all-tickets |
| `audio` | #audio-tickets, #all-tickets |
| No label | #all-tickets only |
| Multiple labels | Each matching channel + #all-tickets |

## Discord Commands

| Command | Description |
|---------|-------------|
| `/register jira_email:<email>` | Link your Discord to your Jira account |
| `/unregister` | Unlink your Discord from Jira |
| `/whoami` | Check your current registration status |

## File Locations

| File | Purpose |
|------|---------|
| `/home/claude/discord-bot/` | Discord bot source code |
| `/home/claude/discord-bot/config.json` | Bot configuration (token, n8n URLs) |
| `/home/claude/discord-jira-mappings.json` | User registration mappings |

## Troubleshooting

### Bot not responding to reactions
- Check that the bot has `MESSAGE_CONTENT` intent enabled in Discord Developer Portal
- Ensure the bot has permissions to read message history and add reactions

### Tickets not appearing in Discord
- Verify the n8n workflow is active
- Check Jira webhook is configured correctly
- Ensure labels are exactly `code`, `art`, or `audio` (case-insensitive)

### Assignment failing
- Verify the user's Jira email is correct
- Check that the user has permission to be assigned tickets in Jira
- Ensure the Jira API credentials in n8n are valid

## Webhook Paths

The n8n webhooks the Discord bot calls:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/webhook/assign-ticket` | POST | Assign ticket to user |
| `/webhook/register-user` | POST/DELETE/GET | User registration |

## Security Note

⚠️ **Important:** The `config.json` file contains your Discord bot token. Keep this file secure and never commit it to public repositories.

---

Created for the seed-1 game development project at Tidal Studios.
