const { SlashCommandBuilder } = require('discord.js');
const { createLogger } = require('../../src/utils/logger');
const { isValidEmail } = require('../../src/utils/validators');
const n8nService = require('../../src/services/n8nService');

const logger = createLogger('Register');

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

        if (!isValidEmail(jiraEmail)) {
            return interaction.reply({
                content: '❌ Invalid email format. Please provide a valid email address.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const result = await n8nService.registerUser(
                interaction.user.id,
                interaction.user.username,
                jiraEmail
            );

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
            logger.error('Registration error:', error);
            await interaction.editReply({
                content: `❌ Error connecting to the registration service. Please try again later.\n\nError: ${error.message}`
            });
        }
    }
};
