import json

# Read the workflow
with open(r'C:\Users\logan\Documents\discord-bot\workflow_backup.json', 'r', encoding='utf-8') as f:
    workflow = json.load(f)

# Create clean workflow object with only the fields n8n accepts for updates
clean_workflow = {
    "name": workflow["name"],
    "nodes": workflow["nodes"],
    "connections": workflow["connections"],
    "settings": workflow["settings"],
    "staticData": workflow.get("staticData", {})
}

# Create new nodes
new_nodes = [
    # Get Thread Messages node
    {
        "credentials": {
            "discordBotApi": {
                "id": "kufANv2ctmeKTuNt",
                "name": "Discord Bot account"
            }
        },
        "id": "get-thread-messages",
        "name": "Get Thread Messages",
        "parameters": {
            "authentication": "predefinedCredentialType",
            "method": "GET",
            "nodeCredentialType": "discordBotApi",
            "options": {},
            "url": "=https://discord.com/api/v10/channels/{{ $json.threadId }}/messages?limit=10"
        },
        "position": [1500, 250],
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2
    },
    # Find Description Message node
    {
        "id": "find-description-message",
        "name": "Find Description Message",
        "parameters": {
            "jsCode": "const messages = $input.first().json;\n// Messages are returned newest-first, so reverse to get chronological order\nconst sorted = [...messages].sort((a, b) => \n  new Date(a.timestamp) - new Date(b.timestamp)\n);\n// Second message is the description (first is the embed)\nconst descriptionMessage = sorted[1];\nreturn {\n  descriptionMessageId: descriptionMessage?.id,\n  threadId: $('Find Thread to Update').item.json.threadId,\n  description: $('Find Thread to Update').item.json.description,\n  issueKey: $('Find Thread to Update').item.json.issueKey,\n  summary: $('Find Thread to Update').item.json.summary\n};"
        },
        "position": [1750, 250],
        "type": "n8n-nodes-base.code",
        "typeVersion": 2
    },
    # Delete Old Description node
    {
        "credentials": {
            "discordBotApi": {
                "id": "kufANv2ctmeKTuNt",
                "name": "Discord Bot account"
            }
        },
        "id": "delete-old-description",
        "name": "Delete Old Description",
        "parameters": {
            "authentication": "predefinedCredentialType",
            "method": "DELETE",
            "nodeCredentialType": "discordBotApi",
            "options": {
                "allowUnauthorizedCerts": False,
                "ignoreResponseCode": False
            },
            "url": "=https://discord.com/api/v10/channels/{{ $json.threadId }}/messages/{{ $json.descriptionMessageId }}"
        },
        "position": [2000, 250],
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "continueOnFail": True
    },
    # Update Thread Name node
    {
        "credentials": {
            "discordBotApi": {
                "id": "kufANv2ctmeKTuNt",
                "name": "Discord Bot account"
            }
        },
        "id": "update-thread-name",
        "name": "Update Thread Name",
        "parameters": {
            "authentication": "predefinedCredentialType",
            "jsonBody": "={{ JSON.stringify({ name: $json.issueKey + ': ' + $json.summary.substring(0, 90) }) }}",
            "method": "PATCH",
            "nodeCredentialType": "discordBotApi",
            "options": {},
            "sendBody": True,
            "specifyBody": "json",
            "url": "=https://discord.com/api/v10/channels/{{ $json.threadId }}"
        },
        "position": [1750, 450],
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2
    }
]

# Add new nodes to the workflow
clean_workflow['nodes'].extend(new_nodes)

# Update the "Post Update Notice" node to remove "Ticket Updated" header
for node in clean_workflow['nodes']:
    if node['id'] == 'post-update-notice':
        # Change the content to just the description without the header
        node['parameters']['jsonBody'] = "={{ JSON.stringify({ content: $('Find Thread to Update').item.json.description }) }}"
        # Update position to be after Delete Old Description
        node['position'] = [2250, 250]
        break

# Update connections
connections = clean_workflow['connections']

# Update Embed now connects to both Get Thread Messages and Update Thread Name
connections['Update Embed'] = {
    "main": [
        [
            {
                "index": 0,
                "node": "Get Thread Messages",
                "type": "main"
            },
            {
                "index": 0,
                "node": "Update Thread Name",
                "type": "main"
            }
        ]
    ]
}

# Get Thread Messages connects to Find Description Message
connections['Get Thread Messages'] = {
    "main": [
        [
            {
                "index": 0,
                "node": "Find Description Message",
                "type": "main"
            }
        ]
    ]
}

# Find Description Message connects to Delete Old Description
connections['Find Description Message'] = {
    "main": [
        [
            {
                "index": 0,
                "node": "Delete Old Description",
                "type": "main"
            }
        ]
    ]
}

# Delete Old Description connects to Post Update Notice
connections['Delete Old Description'] = {
    "main": [
        [
            {
                "index": 0,
                "node": "Post Update Notice",
                "type": "main"
            }
        ]
    ]
}

# Update Thread Name has no outgoing connections (parallel path)
connections['Update Thread Name'] = {
    "main": [[]]
}

# Write the updated workflow
output_file = r'C:\Users\logan\Documents\discord-bot\workflow_clean.json'
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(clean_workflow, f, indent=2)

print(f"Clean workflow saved to {output_file}")
