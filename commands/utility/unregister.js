const { SlashCommandBuilder } = require('discord.js');
const { n8nBaseUrl, webhooks } = require('../../config.json');
const { createLogger } = require('../../src/utils/logger');

const logger = createLogger('Unregister');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unregister')
        .setDescription('Unlink your Discord account from your Jira account'),
    
    async execute(interaction) {
        const discordUserId = interaction.user.id;

        await interaction.deferReply({ ephemeral: true });

        try {
            const response = await fetch(`${n8nBaseUrl}${webhooks.registerUser}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    discordUserId,
                    action: 'unregister'
                })
            });

            const result = await response.json();

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
