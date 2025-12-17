const { SlashCommandBuilder } = require('discord.js');
const { createLogger } = require('../../src/utils/logger');
const n8nService = require('../../src/services/n8nService');

const logger = createLogger('Unregister');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unregister')
        .setDescription('Unlink your Discord account from your Jira account'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const result = await n8nService.unregisterUser(interaction.user.id);

            if (result.success) {
                await interaction.editReply({
                    content: '✅ Successfully unlinked your Discord account from Jira.'
                });
            } else {
                await interaction.editReply({
                    content: `❌ ${result.error || 'You are not currently registered.'}`
                });
            }
        } catch (error) {
            logger.error('Unregistration error:', error);
            await interaction.editReply({
                content: `❌ Error connecting to the service. Please try again later.\n\nError: ${error.message}`
            });
        }
    }
};
