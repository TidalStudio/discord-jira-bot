const { SlashCommandBuilder } = require('discord.js');
const { createLogger } = require('../../src/utils/logger');
const { isValidTicketKey } = require('../../src/utils/validators');
const taskManagementService = require('../../src/services/taskManagementService');

const logger = createLogger('Task');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('task')
        .setDescription('Manage your Jira tasks')
        .addSubcommand(subcommand =>
            subcommand
                .setName('review')
                .setDescription('Submit a task for PM review')
                .addStringOption(option =>
                    option.setName('ticket')
                        .setDescription('Jira ticket key (e.g., KAN-123)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('done')
                .setDescription('Mark a task as done (PM only)')
                .addStringOption(option =>
                    option.setName('ticket')
                        .setDescription('Jira ticket key (e.g., KAN-123)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('deny')
                .setDescription('Deny a task review and send back to In Progress (PM only)')
                .addStringOption(option =>
                    option.setName('ticket')
                        .setDescription('Jira ticket key (e.g., KAN-123)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for denial (optional)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('quit')
                .setDescription('Unassign yourself from a task')
                .addStringOption(option =>
                    option.setName('ticket')
                        .setDescription('Jira ticket key (e.g., KAN-123)')
                        .setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const ticketKey = interaction.options.getString('ticket').toUpperCase();

        if (!isValidTicketKey(ticketKey)) {
            return interaction.reply({
                content: '❌ Invalid ticket format. Use format like `KAN-123`.',
                flags: 64
            });
        }

        await interaction.deferReply({ flags: 64 });

        try {
            switch (subcommand) {
                case 'review':
                    await handleReview(interaction, ticketKey);
                    break;
                case 'done':
                    await handleDone(interaction, ticketKey);
                    break;
                case 'deny':
                    await handleDeny(interaction, ticketKey);
                    break;
                case 'quit':
                    await handleQuit(interaction, ticketKey);
                    break;
            }
        } catch (error) {
            logger.error(`Error in task ${subcommand}:`, error);
            await interaction.editReply({
                content: `⚠️ Error: ${error.message}`
            });
        }
    }
};

async function handleReview(interaction, ticketKey) {
    const result = await taskManagementService.submitForReview({
        ticketKey,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        guild: interaction.guild
    });

    if (!result.success) {
        return interaction.editReply({
            content: `❌ Could not move ticket: ${result.error}`
        });
    }

    await interaction.editReply({
        content: `✅ **${ticketKey}** submitted for review! PMs have been notified.`
    });
}

async function handleDone(interaction, ticketKey) {
    const hasPm = await taskManagementService.hasPmRole(interaction.guild, interaction.user.id);
    if (!hasPm) {
        return interaction.editReply({
            content: '❌ Only PMs can mark tasks as done.'
        });
    }

    const result = await taskManagementService.markAsDone({
        ticketKey,
        approverTag: interaction.user.tag,
        approver: interaction.user,
        guild: interaction.guild
    });

    if (!result.success) {
        return interaction.editReply({
            content: `❌ Could not move ticket: ${result.error}`
        });
    }

    await interaction.editReply({
        content: `✅ **${ticketKey}** marked as **Done** and moved to Completed Tasks!`
    });
}

async function handleDeny(interaction, ticketKey) {
    const hasPm = await taskManagementService.hasPmRole(interaction.guild, interaction.user.id);
    if (!hasPm) {
        return interaction.editReply({
            content: '❌ Only PMs can deny task reviews.'
        });
    }

    const reason = interaction.options.getString('reason') || 'No reason provided';

    const result = await taskManagementService.denyReview({
        ticketKey,
        reason,
        denierTag: interaction.user.tag,
        denierId: interaction.user.id,
        guild: interaction.guild
    });

    if (!result.success) {
        return interaction.editReply({
            content: `❌ Could not deny ticket: ${result.error}`
        });
    }

    await interaction.editReply({
        content: `❌ **${ticketKey}** review denied and sent back to **In Progress**.\nAssignee has been notified.`
    });
}

async function handleQuit(interaction, ticketKey) {
    const result = await taskManagementService.quitTicket({
        ticketKey,
        userId: interaction.user.id,
        username: interaction.user.username,
        guild: interaction.guild
    });

    if (!result.success) {
        return interaction.editReply({
            content: `❌ Could not quit ticket: ${result.error}`
        });
    }

    await interaction.editReply({
        content: `🚪 You've been unassigned from **${ticketKey}**. The ticket has been moved back to **To Do**.`
    });
}
