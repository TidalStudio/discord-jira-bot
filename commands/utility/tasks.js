const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createLogger } = require('../../src/utils/logger');
const n8nService = require('../../src/services/n8nService');
const { getStatusEmoji, getStatusLabel, getStatusColor } = require('../../src/utils/formatters');

const logger = createLogger('Tasks');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tasks')
        .setDescription('List your currently assigned Jira tickets')
        .addStringOption(option =>
            option.setName('status')
                .setDescription('Filter by status')
                .setRequired(false)
                .addChoices(
                    { name: 'To Do', value: 'todo' },
                    { name: 'In Progress', value: 'inprogress' },
                    { name: 'In Review', value: 'inreview' },
                    { name: 'Done', value: 'done' }
                )),

    async execute(interaction, client, config) {
        await interaction.deferReply({ flags: 64 });

        const statusFilter = interaction.options.getString('status');

        try {
            const result = await n8nService.getUserTasks(interaction.user.id, statusFilter);

            if (!result.success) {
                return interaction.editReply({
                    content: `❌ ${result.error || 'Could not fetch your tasks. Make sure you are registered with /register.'}`
                });
            }

            if (!result.tasks || result.tasks.length === 0) {
                const statusText = statusFilter ? ` with status "${getStatusLabel(statusFilter)}"` : '';
                return interaction.editReply({
                    content: `📭 You have no assigned tickets${statusText}.`
                });
            }

            // Build embed with tasks
            const statusText = statusFilter ? ` (${getStatusLabel(statusFilter)})` : '';
            const embed = new EmbedBuilder()
                .setTitle(`📋 Your Assigned Tickets${statusText}`)
                .setColor(getStatusColor(statusFilter))
                .setTimestamp();

            let description = '';
            for (const task of result.tasks) {
                const statusEmoji = getStatusEmoji(task.status);
                description += `${statusEmoji} **[${task.key}](${config.jiraBaseUrl}/browse/${task.key})**: ${task.summary}\n`;
                description += `   └ Status: ${task.status}\n\n`;
            }

            embed.setDescription(description || 'No tasks found.');
            embed.setFooter({ text: `Total: ${result.tasks.length} ticket(s)` });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error('Error fetching tasks:', error);
            await interaction.editReply({
                content: `⚠️ Error: ${error.message}`
            });
        }
    }
};
