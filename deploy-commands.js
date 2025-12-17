require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { createLogger } = require('./src/utils/logger');

const logger = createLogger('Deploy');

const clientId = process.env.DISCORD_CLIENT_ID;
const token = process.env.DISCORD_TOKEN;

const commands = [];
const commandsPath = path.join(__dirname, 'commands', 'utility');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    } else {
        logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

const rest = new REST().setToken(token);

(async () => {
    try {
        logger.info(`Started refreshing ${commands.length} application (/) commands.`);

        // Deploy globally (works in all servers the bot is in)
        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        logger.info(`Successfully reloaded ${data.length} application (/) commands globally.`);
        logger.info('Commands deployed:');
        data.forEach(cmd => logger.info(`  - /${cmd.name}: ${cmd.description}`));
    } catch (error) {
        logger.error('Deployment error:', error);
    }
})();
