const { createLogger } = require('../utils/logger');

const logger = createLogger('CommandHandler');

/**
 * Handle slash command interactions.
 * @param {Interaction} interaction - The Discord interaction
 * @param {Client} client - The Discord client
 * @param {Object} config - Bot configuration
 */
async function handleCommand(interaction, client, config) {
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
}

module.exports = { handleCommand };
