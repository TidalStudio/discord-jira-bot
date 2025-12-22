/**
 * Text Splitter Utility
 *
 * Splits long text into Discord-safe chunks while preserving
 * natural boundaries like paragraphs, sentences, and code blocks.
 */

const MAX_DISCORD_LENGTH = 1900;

/**
 * Find the last occurrence of a sentence ending pattern
 * @param {string} text - Text to search
 * @returns {number} Index after the sentence ending, or -1 if not found
 */
function findLastSentenceEnd(text) {
    const patterns = ['. ', '.\n', '? ', '?\n', '! ', '!\n'];
    let lastIndex = -1;

    for (const pattern of patterns) {
        const idx = text.lastIndexOf(pattern);
        if (idx > lastIndex) {
            lastIndex = idx + pattern.length;
        }
    }

    return lastIndex;
}

/**
 * Check if we're inside an unclosed code block
 * @param {string} text - Text to check
 * @returns {boolean} True if inside a code block
 */
function isInsideCodeBlock(text) {
    const matches = text.match(/```/g);
    return matches ? matches.length % 2 === 1 : false;
}

/**
 * Find the best split point that doesn't break code blocks
 * @param {string} text - Text to split
 * @param {number} maxLength - Maximum chunk length
 * @returns {number} Best index to split at
 */
function findBestSplitPoint(text, maxLength) {
    const searchText = text.substring(0, maxLength);

    // Check if we're inside a code block at maxLength
    if (isInsideCodeBlock(searchText)) {
        // Find the start of this code block and split before it
        const lastCodeStart = searchText.lastIndexOf('```');
        if (lastCodeStart > 0) {
            // Look for a good split point before the code block
            const beforeCode = searchText.substring(0, lastCodeStart);
            const paragraphBreak = beforeCode.lastIndexOf('\n\n');
            if (paragraphBreak > maxLength * 0.3) {
                return paragraphBreak + 2;
            }
            const lineBreak = beforeCode.lastIndexOf('\n');
            if (lineBreak > maxLength * 0.3) {
                return lineBreak + 1;
            }
            // Split right before the code block
            return lastCodeStart;
        }
    }

    // Priority 1: Paragraph break (double newline)
    const paragraphBreak = searchText.lastIndexOf('\n\n');
    if (paragraphBreak > maxLength * 0.5) {
        return paragraphBreak + 2;
    }

    // Priority 2: Single newline
    const lineBreak = searchText.lastIndexOf('\n');
    if (lineBreak > maxLength * 0.5) {
        return lineBreak + 1;
    }

    // Priority 3: Sentence end
    const sentenceEnd = findLastSentenceEnd(searchText);
    if (sentenceEnd > maxLength * 0.5) {
        return sentenceEnd;
    }

    // Priority 4: Word boundary (space)
    const wordBreak = searchText.lastIndexOf(' ');
    if (wordBreak > maxLength * 0.3) {
        return wordBreak + 1;
    }

    // Fallback: Hard cut at maxLength
    return maxLength;
}

/**
 * Split long text into Discord-safe chunks
 * @param {string} text - Text to split
 * @param {number} maxLength - Maximum length per chunk (default 1900)
 * @returns {string[]} Array of text chunks
 */
function splitTextForDiscord(text, maxLength = MAX_DISCORD_LENGTH) {
    if (!text || text.length === 0) {
        return ['No description provided.'];
    }

    if (text.length <= maxLength) {
        return [text];
    }

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining.trim());
            break;
        }

        const splitIndex = findBestSplitPoint(remaining, maxLength);
        const chunk = remaining.substring(0, splitIndex).trim();

        if (chunk.length > 0) {
            chunks.push(chunk);
        }

        remaining = remaining.substring(splitIndex).trim();

        // Safety check to prevent infinite loops
        if (splitIndex === 0) {
            chunks.push(remaining.substring(0, maxLength));
            remaining = remaining.substring(maxLength);
        }
    }

    return chunks;
}

module.exports = {
    splitTextForDiscord
};
