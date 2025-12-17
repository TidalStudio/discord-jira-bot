require('dotenv').config();
const { Client, Events, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./src/config');
const { createLogger } = require('./src/utils/logger');
const { loadCommands } = require('./src/utils/commandLoader');
const { handleCommand } = require('./src/handlers/commandHandler');
const { handleReaction } = require('./src/handlers/reactionHandler');
const { ticketThreadMap } = require('./src/state/ticketState');

const logger = createLogger('Bot');

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

client.commands = loadCommands();
client.ticketThreadMap = ticketThreadMap;

client.once(Events.ClientReady, readyClient => {
    logger.info(`Discord bot ready! Logged in as ${readyClient.user.tag}`);
    logger.info(`Connected to n8n at: ${config.n8nBaseUrl}`);
    logger.debug(`Forum channels - Code: ${config.channels.codeUnassigned}, Art: ${config.channels.artUnassigned}, Audio: ${config.channels.audioUnassigned}`);
    logger.debug(`Review channel: ${config.channels.tasksForReview}, Working category: ${config.categories.workingTickets}`);
});

client.on(Events.InteractionCreate, interaction => handleCommand(interaction, client, config));
client.on(Events.MessageReactionAdd, (reaction, user) => handleReaction(reaction, user, client, config));

client.login(config.token);
