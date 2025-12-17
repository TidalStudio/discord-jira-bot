require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const config = require('./src/config');
const { createLogger } = require('./src/utils/logger');
const { EMOJIS, JIRA_STATUS, COLORS, TIMEOUTS, FORUM } = require('./src/utils/constants');
const { extractTicketKey } = require('./src/utils/validators');

const logger = createLogger('Bot');
const {
    Client,
    Collection,
    Events,
    GatewayIntentBits,
    Partials,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');

// Create client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.ThreadMember]
});

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands', 'utility');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Store for tracking forum posts (ticket key -> thread ID mapping)
const ticketThreadMap = new Map();

// Ready event
client.once(Events.ClientReady, readyClient => {
    logger.info(`✅ Discord bot ready! Logged in as ${readyClient.user.tag}`);
    logger.info(`🔗 Connected to n8n at: ${config.n8nBaseUrl}`);
    logger.info(`📁 Forum channels configured:`);
    logger.debug(`   Code: ${config.channels.codeUnassigned}`);
    logger.debug(`   Art: ${config.channels.artUnassigned}`);
    logger.debug(`   Audio: ${config.channels.audioUnassigned}`);
    logger.debug(`   Review: ${config.channels.tasksForReview}`);
    logger.debug(`   Working Tickets Category: ${config.categories.workingTickets}`);
});

// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        logger.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction, client, config);
    } catch (error) {
        logger.error('Command execution error:', error);
        const errorMessage = { content: 'There was an error while executing this command!', flags: 64 };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

// Handle reaction add events (for claiming tickets and approving reviews)
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    // Ignore bot reactions
    if (user.bot) return;

    // Handle partial reactions
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            logger.error('Error fetching reaction:', error);
            return;
        }
    }

    // Check if it's a checkmark or X emoji
    const emojiName = reaction.emoji.name;

    const isCheckmark = EMOJIS.CHECKMARKS.includes(emojiName);
    const isDeny = EMOJIS.DENY.includes(emojiName);
    
    if (!isCheckmark && !isDeny) return;

    const message = reaction.message;
    const channel = message.channel;

    // Check if this is a forum thread
    if (channel.type !== ChannelType.PublicThread && channel.type !== ChannelType.PrivateThread) {
        return;
    }

    const parentId = channel.parentId;
    
    // Extract Jira ticket key from thread name or message
    let jiraTicketKey = null;
    
    // Try thread name first (format: "KAN-123: Title")
    jiraTicketKey = extractTicketKey(channel.name);
    
    // Also check message embeds and content
    if (!jiraTicketKey && message.embeds && message.embeds.length > 0) {
        for (const embed of message.embeds) {
            jiraTicketKey = extractTicketKey(embed.title);
            if (!jiraTicketKey) {
                // Fallback: extract from URL
                const urlMatch = embed.url?.match(/browse\/([A-Z]+-\d+)/);
                if (urlMatch) jiraTicketKey = urlMatch[1];
            }
            if (jiraTicketKey) break;
        }
    }

    if (!jiraTicketKey) {
        logger.debug('No Jira ticket found in thread/message');
        return;
    }

    // Determine what action based on which forum channel and emoji
    const unassignedChannels = [
        config.channels.codeUnassigned,
        config.channels.artUnassigned,
        config.channels.audioUnassigned
    ];

    if (isCheckmark && unassignedChannels.includes(parentId)) {
        // User is claiming a ticket
        await handleClaimTicket(reaction, user, jiraTicketKey, channel);
    } else if (parentId === config.channels.tasksForReview) {
        if (isCheckmark) {
            // PM is approving a ticket
            await handleApproveTicket(reaction, user, jiraTicketKey, channel);
        } else if (isDeny) {
            // PM is denying a ticket
            await handleDenyTicket(reaction, user, jiraTicketKey, channel);
        }
    }
});

// Handle claiming a ticket from unassigned forum
async function handleClaimTicket(reaction, user, jiraTicketKey, thread) {
    logger.info(`✅ User ${user.tag} claiming ticket ${jiraTicketKey}`);

    try {
        const response = await fetch(`${config.n8nBaseUrl}${config.webhooks.assignTicket}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                discordUserId: user.id,
                discordUsername: user.username,
                discordTag: user.tag,
                jiraTicketKey: jiraTicketKey,
                threadId: thread.id,
                action: 'claim'
            })
        });

        const result = await response.json();
        
        if (result.success) {
            // Send confirmation in thread
            await thread.send({
                content: `✅ <@${user.id}> claimed this ticket! Moving to **In Progress**. This thread will be deleted.`,
                allowedMentions: { users: [user.id] }
            });

            // Create or update user's private task forum with description
            await createOrUpdateUserTaskForum(
                user, 
                jiraTicketKey, 
                result.summary || thread.name, 
                result.description,
                result.priority,
                result.labels
            );

            // Delete the unassigned thread after a short delay
            setTimeout(async () => {
                try {
                    await thread.delete('Ticket claimed - moved to working tickets');
                    logger.info(`🗑️ Deleted unassigned thread for ${jiraTicketKey}`);
                } catch (e) {
                    logger.error('Could not delete unassigned thread:', e);
                    // Fallback to archive if delete fails
                    try {
                        await thread.setArchived(true);
                    } catch (e2) {
                        logger.error('Could not archive thread either:', e2);
                    }
                }
            }, TIMEOUTS.THREAD_DELETE_LONG);

            logger.info(`✅ Ticket ${jiraTicketKey} claimed by ${user.tag}`);
        } else {
            await thread.send({
                content: `❌ <@${user.id}> Could not claim ticket: ${result.error || 'Unknown error'}. Make sure you've registered with \`/register\`.`,
                allowedMentions: { users: [user.id] }
            });
        }
    } catch (error) {
        logger.error('Error claiming ticket:', error);
        await thread.send({
            content: `⚠️ <@${user.id}> Error processing claim: ${error.message}`,
            allowedMentions: { users: [user.id] }
        });
    }
}

// Handle PM approving a ticket in review
async function handleApproveTicket(reaction, user, jiraTicketKey, thread) {
    // Check if user has PM role
    const guild = thread.guild;
    const member = await guild.members.fetch(user.id);
    
    if (!member.roles.cache.has(config.roles.pm)) {
        await thread.send({
            content: `❌ <@${user.id}> Only PMs can approve tickets.`,
            allowedMentions: { users: [user.id] }
        });
        return;
    }

    logger.info(`✅ PM ${user.tag} approving ticket ${jiraTicketKey}`);

    try {
        const response = await fetch(`${config.n8nBaseUrl}${config.webhooks.moveTicket}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jiraTicketKey: jiraTicketKey,
                targetStatus: JIRA_STATUS.DONE,
                approvedBy: user.tag
            })
        });

        const result = await response.json();
        
        if (result.success) {
            await thread.send({
                content: `✅ Ticket **${jiraTicketKey}** approved by <@${user.id}> and moved to **Done**! Cleaning up threads...`,
                allowedMentions: { users: [user.id] }
            });

            // Find the assignee's Discord user via their Jira email
            const assigneeEmail = result.assignee?.emailAddress;
            logger.debug(`Assignee info from Jira:`, JSON.stringify(result.assignee, null, 2));
            
            let discordUser = null;
            let discordUserId = null;
            
            if (assigneeEmail) {
                try {
                    const lookupResponse = await fetch(`${config.n8nBaseUrl}/webhook/lookup-user`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ jiraEmail: assigneeEmail })
                    });
                    const lookupResult = await lookupResponse.json();
                    logger.debug(`Lookup result for ${assigneeEmail}:`, JSON.stringify(lookupResult, null, 2));
                    if (lookupResult.discordId) {
                        discordUserId = lookupResult.discordId;
                        discordUser = await guild.members.fetch(discordUserId).catch((e) => {
                            logger.debug(`Could not fetch Discord member ${discordUserId}:`, e.message);
                            return null;
                        });
                    }
                } catch (e) {
                    logger.debug('Could not lookup Discord user from Jira email:', e.message);
                }
            } else {
                logger.debug('No email address in assignee data');
            }
            
            const workingCategory = guild.channels.cache.get(config.categories.workingTickets);
            let userForum = null;
            let ticketThread = null;
            
            if (workingCategory) {
                // Primary method: Find forum by Discord username
                if (discordUser) {
                    const assigneeForumName = `tasks-${discordUser.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
                    logger.debug(`Looking for forum by username: ${assigneeForumName}`);
                    userForum = workingCategory.children?.cache.find(
                        ch => ch.name === assigneeForumName && ch.type === ChannelType.GuildForum
                    );
                }
                
                // Backup method: Find forum by permission overwrites (user has ViewChannel permission)
                if (!userForum && discordUserId) {
                    logger.debug(`Username lookup failed, trying permission-based lookup for user ID: ${discordUserId}`);
                    userForum = workingCategory.children?.cache.find(ch => {
                        if (ch.type !== ChannelType.GuildForum) return false;
                        const perms = ch.permissionOverwrites.cache.get(discordUserId);
                        return perms && perms.allow.has(PermissionFlagsBits.ViewChannel);
                    });
                    if (userForum) {
                        logger.debug(`Found forum via permissions: ${userForum.name}`);
                    }
                }
                
                // Last resort: Search ALL forums in the category for a thread with this ticket key
                if (!userForum) {
                    logger.debug(`User lookup failed, searching all forums for ticket thread: ${jiraTicketKey}`);
                    const allForums = workingCategory.children?.cache.filter(ch => ch.type === ChannelType.GuildForum);
                    
                    for (const [, forum] of allForums) {
                        try {
                            const activeThreads = await forum.threads.fetchActive();
                            const archivedThreads = await forum.threads.fetchArchived();
                            
                            ticketThread = activeThreads.threads.find(t => t.name.startsWith(jiraTicketKey));
                            if (!ticketThread) {
                                ticketThread = archivedThreads.threads.find(t => t.name.startsWith(jiraTicketKey));
                            }
                            
                            if (ticketThread) {
                                userForum = forum;
                                logger.debug(`Found ticket thread in forum: ${forum.name}`);
                                break;
                            }
                        } catch (e) {
                            logger.debug(`Error searching forum ${forum.name}:`, e.message);
                        }
                    }
                }
                
                if (userForum && !ticketThread) {
                    // Fetch threads if we found forum but not thread yet
                    const activeThreads = await userForum.threads.fetchActive();
                    const archivedThreads = await userForum.threads.fetchArchived();
                    
                    ticketThread = activeThreads.threads.find(t => t.name.startsWith(jiraTicketKey));
                    if (!ticketThread) {
                        ticketThread = archivedThreads.threads.find(t => t.name.startsWith(jiraTicketKey));
                    }
                }
                
                if (ticketThread) {
                    setTimeout(async () => {
                        try {
                            await ticketThread.delete('Task completed - moved to completed tasks');
                            logger.info(`🗑️ Deleted working ticket thread for ${jiraTicketKey}`);
                        } catch (e) {
                            logger.error('Could not delete working ticket thread:', e);
                        }
                    }, TIMEOUTS.THREAD_DELETE_SHORT);
                }
            }

            // Create thread in Completed Tasks forum
            await createCompletedTaskThread(guild, jiraTicketKey, result, user);

            // Delete the review thread
            setTimeout(async () => {
                try {
                    await thread.delete('Task approved - moved to completed tasks');
                    logger.info(`🗑️ Deleted review thread for ${jiraTicketKey}`);
                } catch (e) {
                    logger.error('Could not delete review thread:', e);
                }
            }, TIMEOUTS.THREAD_DELETE_LONG);
        } else {
            await thread.send({
                content: `❌ Could not approve ticket: ${result.error || 'Unknown error'}`,
            });
        }
    } catch (error) {
        logger.error('Error approving ticket:', error);
        await thread.send({ content: `⚠️ Error: ${error.message}` });
    }
}

// Handle PM denying a ticket in review - sends it back to In Progress
async function handleDenyTicket(reaction, user, jiraTicketKey, thread) {
    // Check if user has PM role
    const guild = thread.guild;
    const member = await guild.members.fetch(user.id);
    
    if (!member.roles.cache.has(config.roles.pm)) {
        await thread.send({
            content: `❌ <@${user.id}> Only PMs can deny tickets.`,
            allowedMentions: { users: [user.id] }
        });
        return;
    }

    logger.info(`❌ PM ${user.tag} denying ticket ${jiraTicketKey}`);

    try {
        // Move ticket back to In Progress
        const response = await fetch(`${config.n8nBaseUrl}${config.webhooks.moveTicket}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jiraTicketKey: jiraTicketKey,
                targetStatus: JIRA_STATUS.IN_PROGRESS,
                deniedBy: user.tag
            })
        });

        const result = await response.json();
        
        if (result.success) {
            // Find the assignee's Discord user via their Jira email
            const assigneeEmail = result.assignee?.emailAddress;
            logger.debug(`Assignee info from Jira:`, JSON.stringify(result.assignee, null, 2));
            
            let discordUser = null;
            let discordUserId = null;
            
            if (assigneeEmail) {
                // Look up Discord user by Jira email using the lookup webhook
                try {
                    const lookupResponse = await fetch(`${config.n8nBaseUrl}/webhook/lookup-user`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ jiraEmail: assigneeEmail })
                    });
                    const lookupResult = await lookupResponse.json();
                    logger.debug(`Lookup result for ${assigneeEmail}:`, JSON.stringify(lookupResult, null, 2));
                    if (lookupResult.discordId) {
                        discordUserId = lookupResult.discordId;
                        discordUser = await guild.members.fetch(discordUserId).catch((e) => {
                            logger.debug(`Could not fetch Discord member ${discordUserId}:`, e.message);
                            return null;
                        });
                    }
                } catch (e) {
                    logger.debug('Could not lookup Discord user from Jira email:', e.message);
                }
            } else {
                logger.debug('No email address in assignee data');
            }
            
            const workingCategory = guild.channels.cache.get(config.categories.workingTickets);
            let userForum = null;
            let ticketThread = null;
            
            if (workingCategory) {
                // Primary method: Find forum by Discord username
                if (discordUser) {
                    const assigneeForumName = `tasks-${discordUser.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
                    logger.debug(`Looking for forum by username: ${assigneeForumName}`);
                    userForum = workingCategory.children?.cache.find(
                        ch => ch.name === assigneeForumName && ch.type === ChannelType.GuildForum
                    );
                }
                
                // Backup method: Find forum by permission overwrites (user has ViewChannel permission)
                if (!userForum && discordUserId) {
                    logger.debug(`Username lookup failed, trying permission-based lookup for user ID: ${discordUserId}`);
                    userForum = workingCategory.children?.cache.find(ch => {
                        if (ch.type !== ChannelType.GuildForum) return false;
                        const perms = ch.permissionOverwrites.cache.get(discordUserId);
                        return perms && perms.allow.has(PermissionFlagsBits.ViewChannel);
                    });
                    if (userForum) {
                        logger.debug(`Found forum via permissions: ${userForum.name}`);
                    }
                }
                
                // Last resort: Search ALL forums in the category for a thread with this ticket key
                if (!userForum) {
                    logger.debug(`User lookup failed, searching all forums for ticket thread: ${jiraTicketKey}`);
                    const allForums = workingCategory.children?.cache.filter(ch => ch.type === ChannelType.GuildForum);
                    
                    for (const [, forum] of allForums) {
                        try {
                            const activeThreads = await forum.threads.fetchActive();
                            const archivedThreads = await forum.threads.fetchArchived();
                            
                            ticketThread = activeThreads.threads.find(t => t.name.startsWith(jiraTicketKey));
                            if (!ticketThread) {
                                ticketThread = archivedThreads.threads.find(t => t.name.startsWith(jiraTicketKey));
                            }
                            
                            if (ticketThread) {
                                userForum = forum;
                                logger.debug(`Found ticket thread in forum: ${forum.name}`);
                                break;
                            }
                        } catch (e) {
                            logger.debug(`Error searching forum ${forum.name}:`, e.message);
                        }
                    }
                }
                
                if (userForum) {
                    logger.debug(`Found working forum: ${userForum.name}`);
                    
                    // If we didn't already find the thread in the last-resort search, find it now
                    if (!ticketThread) {
                        const activeThreads = await userForum.threads.fetchActive();
                        const archivedThreads = await userForum.threads.fetchArchived();
                        
                        ticketThread = activeThreads.threads.find(t => t.name.startsWith(jiraTicketKey));
                        if (!ticketThread) {
                            ticketThread = archivedThreads.threads.find(t => t.name.startsWith(jiraTicketKey));
                        }
                    }
                    
                    if (ticketThread) {
                        logger.debug(`Found ticket thread: ${ticketThread.name}`);
                        // Unarchive if needed
                        if (ticketThread.archived) {
                            await ticketThread.setArchived(false);
                        }
                        // Post denial message with default reason since emoji doesn't allow custom reason
                        // Ping the assignee so they get notified
                        const assigneePing = discordUserId ? `<@${discordUserId}> - ` : '';
                        await ticketThread.send({
                            content: `${assigneePing}⚠️ **Review Denied** by <@${user.id}>.\n\n**Reason:** Please review feedback in the review thread or contact the PM for details.\n\nYour task has been sent back to **In Progress**. Use \`/task review ${jiraTicketKey}\` when ready to resubmit.`
                        });
                        logger.debug(`Posted denial message to working thread for ${jiraTicketKey}`);
                    } else {
                        logger.debug(`Could not find ticket thread starting with ${jiraTicketKey}`);
                    }
                } else {
                    logger.debug(`Could not find working forum for user`);
                }
            } else {
                logger.debug(`Could not find working category: ${config.categories.workingTickets}`);
            }

            // Delete the review thread (result is pushed to working thread)
            setTimeout(async () => {
                try {
                    await thread.delete('Review denied - feedback sent to working thread');
                    logger.info(`🗑️ Deleted review thread for ${jiraTicketKey} (denied)`);
                } catch (e) {
                    logger.error('Could not delete review thread:', e);
                }
            }, TIMEOUTS.THREAD_DELETE_SHORT);
        } else {
            await thread.send({
                content: `❌ Could not deny ticket: ${result.error || 'Unknown error'}`,
            });
        }
    } catch (error) {
        logger.error('Error denying ticket:', error);
        await thread.send({ content: `⚠️ Error: ${error.message}` });
    }
}

// Create or update a user's private task forum channel
async function createOrUpdateUserTaskForum(user, ticketKey, ticketTitle, description, priority, labels) {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;

    // Use Discord username for human-readable forum name
    const forumName = `tasks-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    
    // Look for existing forum channel in the working tickets category
    const workingCategory = guild.channels.cache.get(config.categories.workingTickets);
    let taskForum = null;
    
    if (workingCategory) {
        taskForum = workingCategory.children?.cache.find(
            ch => ch.name === forumName && ch.type === ChannelType.GuildForum
        );
    }

    // Create forum if doesn't exist
    if (!taskForum) {
        try {
            taskForum = await guild.channels.create({
                name: forumName,
                type: ChannelType.GuildForum,
                parent: config.categories.workingTickets,
                topic: `Personal task board for ${user.username}`,
                permissionOverwrites: [
                    {
                        id: guild.id, // @everyone
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                    },
                    {
                        id: client.user.id, // Bot
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageThreads]
                    }
                ]
            });

            logger.info(`📁 Created private task forum for ${user.tag}`);
        } catch (error) {
            logger.error('Error creating task forum:', error);
            return;
        }
    }

    // Create a thread for this ticket in the user's forum
    try {
        const cleanTitle = ticketTitle.replace(/^[A-Z]+-\d+:\s*/, '');
        
        // Build embed fields matching unassigned forum format
        const embedFields = [
            { name: 'Status', value: JIRA_STATUS.IN_PROGRESS, inline: true },
            { name: 'Priority', value: priority || 'None', inline: true },
            { name: 'Assigned To', value: `<@${user.id}>`, inline: true }
        ];
        
        // Add labels if present
        if (labels && labels.length > 0) {
            const labelStr = Array.isArray(labels) ? labels.join(', ') : labels;
            embedFields.push({ name: 'Labels', value: labelStr, inline: true });
        }
        
        // Create thread with embed (matching unassigned format)
        const thread = await taskForum.threads.create({
            name: `${ticketKey}: ${cleanTitle}`,
            message: {
                embeds: [{
                    title: `${ticketKey}: ${cleanTitle}`,
                    url: `${config.jiraBaseUrl}/browse/${ticketKey}`,
                    color: COLORS.SUCCESS,
                    fields: embedFields,
                    footer: { text: 'Use /task review to submit for PM review' },
                    timestamp: new Date().toISOString()
                }]
            }
        });

        // Post description as separate message (matching unassigned format)
        let descriptionText = 'No description provided.';
        if (description) {
            descriptionText = parseJiraDescription(description);
        }
        
        // Truncate if too long for Discord message
        if (descriptionText.length > 1900) {
            descriptionText = descriptionText.substring(0, 1900) + '\n\n*[View full description in Jira]*';
        }
        
        await thread.send({ content: descriptionText });

        logger.info(`📝 Created task thread ${ticketKey} for ${user.tag}`);
    } catch (error) {
        logger.error('Error creating task thread:', error);
    }
}

// Parse Jira description (handles both ADF and plain text)
function parseJiraDescription(description) {
    if (!description) return 'No description provided.';
    
    // If it's a string, apply Jira wiki markup conversion
    if (typeof description === 'string') {
        return jiraToDiscord(description);
    }
    
    // If it's ADF (Atlassian Document Format), parse it
    if (description.content) {
        return parseAdfToText(description);
    }
    
    return 'No description provided.';
}

// Convert Jira wiki markup to Discord markdown
function jiraToDiscord(text) {
    if (!text) return text;
    return text
        .replace(/\{code:(\w+)\}/g, '```$1')
        .replace(/\{code\}/g, '```')
        .replace(/\{noformat\}/g, '```')
        .replace(/^h1\.\s*/gm, '# ')
        .replace(/^h2\.\s*/gm, '## ')
        .replace(/^h3\.\s*/gm, '### ')
        .replace(/^h4\.\s*/gm, '#### ')
        .replace(/^h5\.\s*/gm, '##### ')
        .replace(/^h6\.\s*/gm, '###### ')
        .replace(/\[([^\|\]]+)\|([^\]]+)\]/g, '[$1]($2)')
        .replace(/(?<![*\w])\*([^*\n]+?)\*(?![*\w])/g, '**$1**')
        .replace(/\{\{([^}]+)\}\}/g, '`$1`');
}

// Parse Atlassian Document Format to plain text
function parseAdfToText(adf) {
    if (!adf || !adf.content) return '';
    
    let text = '';
    
    function processNode(node) {
        if (!node) return;
        
        if (node.type === 'text') {
            text += node.text || '';
        } else if (node.type === 'hardBreak') {
            text += '\n';
        } else if (node.type === 'paragraph') {
            if (node.content) {
                node.content.forEach(processNode);
            }
            text += '\n';
        } else if (node.type === 'bulletList' || node.type === 'orderedList') {
            if (node.content) {
                node.content.forEach((item, index) => {
                    const prefix = node.type === 'orderedList' ? `${index + 1}. ` : '• ';
                    text += prefix;
                    if (item.content) {
                        item.content.forEach(processNode);
                    }
                });
            }
        } else if (node.type === 'listItem') {
            if (node.content) {
                node.content.forEach(processNode);
            }
        } else if (node.type === 'heading') {
            const level = node.attrs?.level || 1;
            text += '#'.repeat(level) + ' ';
            if (node.content) {
                node.content.forEach(processNode);
            }
            text += '\n';
        } else if (node.type === 'codeBlock') {
            text += '```\n';
            if (node.content) {
                node.content.forEach(processNode);
            }
            text += '```\n';
        } else if (node.content) {
            node.content.forEach(processNode);
        }
    }
    
    adf.content.forEach(processNode);
    
    return text.trim();
}

// Create a completed task thread in the Completed Tasks category
async function createCompletedTaskThread(guild, ticketKey, ticketInfo, approver) {
    try {
        logger.debug(`Creating completed task thread for ${ticketKey}...`);

        const assigneeName = ticketInfo.assignee?.displayName || ticketInfo.assignee?.name || 'Unassigned';
        const forumName = `tasks-${assigneeName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

        logger.debug(`Assignee: ${assigneeName}, Forum name: ${forumName}`);

        // Look for existing forum channel in the completed tasks category
        const completedCategory = guild.channels.cache.get(config.categories.completedTasks);
        let userForum = null;
        
        if (completedCategory) {
            userForum = completedCategory.children?.cache.find(
                ch => ch.name === forumName && ch.type === ChannelType.GuildForum
            );
        }

        // Create forum if doesn't exist
        if (!userForum) {
            logger.debug(`Forum ${forumName} not found in completed tasks, creating...`);
            try {
                userForum = await guild.channels.create({
                    name: forumName,
                    type: ChannelType.GuildForum,
                    parent: config.categories.completedTasks,
                    topic: `Completed tasks for ${assigneeName}`,
                    defaultAutoArchiveDuration: FORUM.AUTO_ARCHIVE_DURATION
                });
                logger.info(`✅ Created completed tasks forum: ${forumName} (ID: ${userForum.id})`);
            } catch (error) {
                logger.error('Error creating completed tasks forum:', error);
                return;
            }
        } else {
            logger.debug(`Found existing completed tasks forum: ${forumName}`);
        }

        // Create thread for the completed task
        const thread = await userForum.threads.create({
            name: `✅ ${ticketKey}: ${ticketInfo.summary || 'Completed Task'}`,
            message: {
                embeds: [{
                    title: `✅ ${ticketKey}: ${ticketInfo.summary || 'Task'}`,
                    url: `${config.jiraBaseUrl}/browse/${ticketKey}`,
                    description: `Task completed and approved!`,
                    color: COLORS.DONE,
                    fields: [
                        { name: 'Status', value: JIRA_STATUS.DONE, inline: true },
                        { name: 'Completed By', value: assigneeName, inline: true },
                        { name: 'Approved By', value: approver.tag, inline: true }
                    ],
                    footer: { text: 'Great work! 🎉' },
                    timestamp: new Date().toISOString()
                }]
            }
        });

        logger.info(`✅ Created completed task thread for ${ticketKey} in ${forumName}`);
    } catch (error) {
        logger.error('Error creating completed task thread:', error);
        logger.error('Error stack:', error.stack);
    }
}

// Export for use in commands
client.createOrUpdateUserTaskForum = createOrUpdateUserTaskForum;
client.ticketThreadMap = ticketThreadMap;

// Login
client.login(config.token);
