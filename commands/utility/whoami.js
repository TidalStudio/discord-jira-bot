const { SlashCommandBuilder } = require('discord.js');
const { n8nBaseUrl, webhooks } = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('whoami')
        .setDescription('Check your current Jira registration status'),
    
    async execute(interaction) {
        const discordUserId = interaction.user.id;

        await interaction.deferReply({ ephemeral: true });

        try {
            const response = await fetch(`${n8nBaseUrl}${webhooks.registerUser}?discordUserId=${discordUserId}&action=lookup`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success && result.jiraEmail) {
                await interaction.editReply({
                    content: `📋 **Your Registration Status**\n\n` +
                        `**Discord:** ${interaction.user.tag}\n` +
                        `**Jira Email:** \`${result.jiraEmail}\`\n` +
                        `**Registered:** ${result.registeredAt ? new Date(result.registeredAt).toLocaleString() : 'Unknown'}\n\n` +
                        `React with ✅ on Jira ticket messages to assign them to yourself!`
                });
            } else {
                await interaction.editReply({
                    content: `❌ You are not registered.\n\nUse \`/register jira_email:your@email.com\` to link your Discord to Jira.`
                });
            }
        } catch (error) {
            console.error('Lookup error:', error);
            await interaction.editReply({
                content: `❌ Error checking registration. Please try again later.\n\nError: ${error.message}`
            });
        }
    }
};
