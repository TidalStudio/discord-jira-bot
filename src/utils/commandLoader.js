const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');
const { createLogger } = require('./logger');

const logger = createLogger('CommandLoader');

/**
 * Load all commands from the commands/utility directory.
 * @returns {Collection} Collection of commands keyed by command name
 */
function loadCommands() {
    const commands = new Collection();
    const commandsPath = path.join(__dirname, '..', '..', 'commands', 'utility');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.set(command.data.name, command);
        } else {
            logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }

    return commands;
}

module.exports = { loadCommands };
