const { SlashCommandBuilder } = require('discord.js');
const { createLogger } = require('../../src/utils/logger');
const n8nService = require('../../src/services/n8nService');
const config = require('../../src/config');

const logger = createLogger('Jira');

const VALID_CATEGORIES = ['code', 'art', 'audio', 'writing'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jira')
        .setDescription('Jira integration commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('sync')
                .setDescription('Sync unassigned Jira tickets to Discord forums (PM only)')
                .addStringOption(option =>
                    option.setName('category')
                        .setDescription('Category to sync (default: all)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Code', value: 'code' },
                            { name: 'Art', value: 'art' },
                            { name: 'Audio', value: 'audio' },
                            { name: 'Writing', value: 'writing' }
                        ))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'sync') {
            await handleSync(interaction);
        }
    }
};

async function handleSync(interaction) {
    // Check PM role
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasPmRole = member.roles.cache.has(config.roles.pm);

    if (!hasPmRole) {
        return interaction.reply({
            content: '❌ Only PMs can use this command.',
            flags: 64
        });
    }

    const category = interaction.options.getString('category');

    await interaction.deferReply({ flags: 64 });

    logger.info(`PM ${interaction.user.tag} initiating Jira sync${category ? ` for category: ${category}` : ' for all categories'}`);

    try {
        const result = await n8nService.syncJira(category);

        if (!result.success) {
            return interaction.editReply({
                content: `❌ Sync failed: ${result.error}`
            });
        }

        const categoryLabel = category ? category.charAt(0).toUpperCase() + category.slice(1) : 'All';

        await interaction.editReply({
            embeds: [{
                title: '✅ Jira Sync Complete',
                color: 0x00ff00,
                fields: [
                    { name: 'Category', value: categoryLabel, inline: true },
                    { name: 'Created', value: `${result.created || 0} threads`, inline: true },
                    { name: 'Skipped', value: `${result.skipped || 0} (already exist)`, inline: true },
                    { name: 'Total', value: `${result.total || 0} unassigned tickets`, inline: true }
                ],
                timestamp: new Date().toISOString()
            }]
        });

        logger.info(`Jira sync completed: created=${result.created}, skipped=${result.skipped}, total=${result.total}`);
    } catch (error) {
        logger.error('Error during Jira sync:', error);
        await interaction.editReply({
            content: `⚠️ Error during sync: ${error.message}`
        });
    }
}
