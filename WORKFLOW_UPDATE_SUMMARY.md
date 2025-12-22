# Workflow Update Summary

## Workflow: Jira to Discord - Unassigned Forum Posts (On0lH2EoEodWDnFM)

### Problem Fixed
When a ticket was updated, the workflow would post a NEW "Ticket Updated" message but leave the old description message, creating duplicates.

### Changes Made

#### 1. Added "Get Thread Messages" Node
- **Type**: HTTP Request (GET)
- **URL**: `https://discord.com/api/v10/channels/{{ $json.threadId }}/messages?limit=10`
- **Purpose**: Fetches the last 10 messages in the thread to find the old description message
- **Position**: After "Update Embed"

#### 2. Added "Find Description Message" Node
- **Type**: Code
- **Purpose**: Identifies the second message (description) from the sorted message list
- **Logic**: 
  - Messages are returned newest-first, so we reverse to get chronological order
  - The second message is the description (first is the embed)
  - Passes through necessary data (descriptionMessageId, threadId, description, issueKey, summary)

#### 3. Added "Delete Old Description" Node
- **Type**: HTTP Request (DELETE)
- **URL**: `https://discord.com/api/v10/channels/{{ $json.threadId }}/messages/{{ $json.descriptionMessageId }}`
- **Purpose**: Deletes the old description message before posting the updated one
- **Features**: `continueOnFail: true` to handle cases where the message doesn't exist

#### 4. Modified "Post Update Notice" Node
- **Changed**: Content from `'**Ticket Updated**\n\n' + description` to just `description`
- **Purpose**: Removed the "Ticket Updated" header since we're now replacing the description message

#### 5. Added "Update Thread Name" Node
- **Type**: HTTP Request (PATCH)
- **URL**: `https://discord.com/api/v10/channels/{{ $json.threadId }}`
- **Body**: `{ "name": "issueKey: summary" }`
- **Purpose**: Updates the Discord thread title when the ticket summary changes
- **Runs in parallel** with the description update flow

### New Update Flow

```
Update Embed
    ├─> Get Thread Messages
    │       └─> Find Description Message
    │               └─> Delete Old Description
    │                       └─> Post Update Notice (updated description)
    │
    └─> Update Thread Name (parallel)
```

### Benefits

1. **No More Duplicates**: Old description messages are deleted before posting new ones
2. **Thread Title Updates**: Thread name now updates when ticket summary changes
3. **Clean Message History**: Only one description message exists at any time
4. **Error Handling**: Continues gracefully if old message can't be found/deleted

### Files Created

- `C:\Users\logan\Documents\discord-bot\workflow_backup.json` - Original workflow backup
- `C:\Users\logan\Documents\discord-bot\workflow_clean.json` - Updated workflow (applied to n8n)
- `C:\Users\logan\Documents\discord-bot\WORKFLOW_UPDATE_SUMMARY.md` - This summary

### Testing Recommendations

1. Update a ticket description in Jira
2. Verify the old description message is deleted
3. Verify the new description is posted
4. Update a ticket summary in Jira
5. Verify the Discord thread name updates accordingly
