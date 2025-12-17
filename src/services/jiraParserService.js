/**
 * Jira Description Parser Service
 *
 * Converts Jira descriptions (wiki markup and ADF format) to Discord markdown.
 * Pure utility functions with no external dependencies.
 */

/**
 * Convert Jira wiki markup to Discord markdown
 * @param {string} text - Text with Jira wiki markup
 * @returns {string} Text with Discord markdown
 */
function jiraToDiscord(text) {
    if (!text) return text;
    return text
        .replace(/\{code:(\w+)\}/g, '```$1')
        .replace(/\{code\}/g, '```')
        .replace(/\{noformat\}/g, '```')
        .replace(/^h1\.\s*/gm, '# ')
        .replace(/^h2\.\s*/gm, '## ')
        .replace(/^h3\.\s*/gm, '### ')
        .replace(/^h4\.\s*/gm, '#### ')
        .replace(/^h5\.\s*/gm, '##### ')
        .replace(/^h6\.\s*/gm, '###### ')
        .replace(/\[([^\|\]]+)\|([^\]]+)\]/g, '[$1]($2)')
        .replace(/(?<![*\w])\*([^*\n]+?)\*(?![*\w])/g, '**$1**')
        .replace(/\{\{([^}]+)\}\}/g, '`$1`');
}

/**
 * Parse Atlassian Document Format (ADF) to plain text with Discord markdown
 * @param {Object} adf - ADF object with .content array
 * @returns {string} Parsed text with Discord markdown
 */
function parseAdfToText(adf) {
    if (!adf || !adf.content) return '';

    let text = '';

    function processNode(node) {
        if (!node) return;

        if (node.type === 'text') {
            text += node.text || '';
        } else if (node.type === 'hardBreak') {
            text += '\n';
        } else if (node.type === 'paragraph') {
            if (node.content) {
                node.content.forEach(processNode);
            }
            text += '\n';
        } else if (node.type === 'bulletList' || node.type === 'orderedList') {
            if (node.content) {
                node.content.forEach((item, index) => {
                    const prefix = node.type === 'orderedList' ? `${index + 1}. ` : '• ';
                    text += prefix;
                    if (item.content) {
                        item.content.forEach(processNode);
                    }
                });
            }
        } else if (node.type === 'listItem') {
            if (node.content) {
                node.content.forEach(processNode);
            }
        } else if (node.type === 'heading') {
            const level = node.attrs?.level || 1;
            text += '#'.repeat(level) + ' ';
            if (node.content) {
                node.content.forEach(processNode);
            }
            text += '\n';
        } else if (node.type === 'codeBlock') {
            text += '```\n';
            if (node.content) {
                node.content.forEach(processNode);
            }
            text += '```\n';
        } else if (node.content) {
            node.content.forEach(processNode);
        }
    }

    adf.content.forEach(processNode);

    return text.trim();
}

/**
 * Parse Jira description (handles both ADF and plain text/wiki markup)
 * @param {string|Object} description - Jira description (string or ADF object)
 * @returns {string} Parsed description with Discord markdown
 */
function parseJiraDescription(description) {
    if (!description) return 'No description provided.';

    // If it's a string, apply Jira wiki markup conversion
    if (typeof description === 'string') {
        return jiraToDiscord(description);
    }

    // If it's ADF (Atlassian Document Format), parse it
    if (description.content) {
        return parseAdfToText(description);
    }

    return 'No description provided.';
}

module.exports = {
    jiraToDiscord,
    parseAdfToText,
    parseJiraDescription
};
