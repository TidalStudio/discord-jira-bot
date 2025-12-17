const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createLogger } = require('../../src/utils/logger');
const { JIRA_STATUS, COLORS, STATUS_EMOJIS } = require('../../src/utils/constants');

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
            // Build URL with optional status filter
            let url = `${config.n8nBaseUrl}/webhook/get-user-tasks?discordUserId=${interaction.user.id}`;
            if (statusFilter) {
                url += `&status=${statusFilter}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

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

function getStatusEmoji(status) {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower.includes('done')) return STATUS_EMOJIS.DONE;
    if (statusLower.includes('review')) return STATUS_EMOJIS.IN_REVIEW;
    if (statusLower.includes('progress')) return STATUS_EMOJIS.IN_PROGRESS;
    if (statusLower.includes('to do')) return STATUS_EMOJIS.TO_DO;
    return STATUS_EMOJIS.DEFAULT;
}

function getStatusLabel(status) {
    switch (status) {
        case 'todo': return JIRA_STATUS.TO_DO;
        case 'inprogress': return JIRA_STATUS.IN_PROGRESS;
        case 'inreview': return JIRA_STATUS.IN_REVIEW;
        case 'done': return JIRA_STATUS.DONE;
        default: return status;
    }
}

function getStatusColor(status) {
    switch (status) {
        case 'todo': return COLORS.TO_DO;
        case 'inprogress': return COLORS.IN_PROGRESS;
        case 'inreview': return COLORS.IN_REVIEW;
        case 'done': return COLORS.DONE;
        default: return COLORS.TO_DO;
    }
}
