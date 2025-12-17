const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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
            console.error('Error fetching tasks:', error);
            await interaction.editReply({
                content: `⚠️ Error: ${error.message}`
            });
        }
    }
};

function getStatusEmoji(status) {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower.includes('done')) return '✅';
    if (statusLower.includes('review')) return '🔍';
    if (statusLower.includes('progress')) return '🔄';
    if (statusLower.includes('to do')) return '📋';
    return '📌';
}

function getStatusLabel(status) {
    switch (status) {
        case 'todo': return 'To Do';
        case 'inprogress': return 'In Progress';
        case 'inreview': return 'In Review';
        case 'done': return 'Done';
        default: return status;
    }
}

function getStatusColor(status) {
    switch (status) {
        case 'todo': return 0x3498db;      // Blue
        case 'inprogress': return 0xf39c12; // Orange
        case 'inreview': return 0x9b59b6;   // Purple
        case 'done': return 0x2ecc71;       // Green
        default: return 0x3498db;           // Blue (default)
    }
}
