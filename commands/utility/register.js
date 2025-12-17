const { SlashCommandBuilder } = require('discord.js');
const { n8nBaseUrl, webhooks } = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Link your Discord account to your Jira account')
        .addStringOption(option =>
            option.setName('jira_email')
                .setDescription('Your Jira account email address')
                .setRequired(true)),
    
    async execute(interaction) {
        const jiraEmail = interaction.options.getString('jira_email');
        const discordUserId = interaction.user.id;
        const discordUsername = interaction.user.username;
        const discordTag = interaction.user.tag;

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(jiraEmail)) {
            return await interaction.reply({
                content: '❌ Invalid email format. Please provide a valid email address.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const response = await fetch(`${n8nBaseUrl}${webhooks.registerUser}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    discordUserId,
                    discordUsername,
                    discordTag,
                    jiraEmail,
                    registeredAt: new Date().toISOString()
                })
            });

            const result = await response.json();

            if (result.success) {
                await interaction.editReply({
                    content: `✅ Successfully linked your Discord account to Jira email: \`${jiraEmail}\`\n\nYou can now react with ✅ on Jira ticket messages to assign them to yourself!`
                });
            } else {
                await interaction.editReply({
                    content: `❌ Failed to register: ${result.error || 'Unknown error'}`
                });
            }
        } catch (error) {
            console.error('Registration error:', error);
            await interaction.editReply({
                content: `❌ Error connecting to the registration service. Please try again later.\n\nError: ${error.message}`
            });
        }
    }
};
