require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const config = require('./src/config');
const { createLogger } = require('./src/utils/logger');
const { handleReaction } = require('./src/handlers/reactionHandler');

const logger = createLogger('Bot');
const {
    Client,
    Collection,
    Events,
    GatewayIntentBits,
    Partials
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
client.on(Events.MessageReactionAdd, (reaction, user) => handleReaction(reaction, user, client, config));

// Export for use in commands
client.ticketThreadMap = ticketThreadMap;

// Login
client.login(config.token);
