const { SlashCommandBuilder } = require('discord.js');
const { createLogger } = require('../../src/utils/logger');
const n8nService = require('../../src/services/n8nService');

const logger = createLogger('Whoami');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('whoami')
        .setDescription('Check your current Jira registration status'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const result = await n8nService.lookupUserByDiscordId(interaction.user.id);

            if (result.success && result.jiraEmail) {
                await interaction.editReply({
                    content: `📋 **Your Registration Status**\n\n` +
                        `**Discord:** ${interaction.user.tag}\n` +
                        `**Jira Email:** \`${result.jiraEmail}\`\n` +
                        `**Registered:** ${result.registeredAt ? `<t:${Math.floor(new Date(result.registeredAt).getTime() / 1000)}:f>` : 'Unknown'}\n\n` +
                        `React with ✅ on Jira ticket messages to assign them to yourself!`
                });
            } else {
                await interaction.editReply({
                    content: `❌ You are not registered.\n\nUse \`/register jira_email:your@email.com\` to link your Discord to Jira.`
                });
            }
        } catch (error) {
            logger.error('Lookup error:', error);
            await interaction.editReply({
                content: `❌ Error checking registration. Please try again later.\n\nError: ${error.message}`
            });
        }
    }
};
