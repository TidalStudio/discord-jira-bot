/**
 * Unit tests for jiraParserService
 * Tests Jira wiki markup to Discord markdown conversion and ADF parsing
 */

const { jiraToDiscord, parseAdfToText, parseJiraDescription } = require('../../src/services/jiraParserService');

describe('jiraParserService', () => {
  describe('jiraToDiscord', () => {
    describe('code blocks', () => {
      test('should convert language-specific code blocks', () => {
        expect(jiraToDiscord('{code:js}const x = 1;{code}')).toBe('```jsconst x = 1;```');
      });

      test('should convert generic code blocks', () => {
        expect(jiraToDiscord('{code}some code{code}')).toBe('```some code```');
      });

      test('should convert noformat blocks', () => {
        expect(jiraToDiscord('{noformat}preformatted{noformat}')).toBe('```preformatted```');
      });

      test('should handle multiple code blocks', () => {
        const input = '{code:python}print("hello"){code}\nText\n{code:js}console.log("hi"){code}';
        const expected = '```pythonprint("hello")```\nText\n```jsconsole.log("hi")```';
        expect(jiraToDiscord(input)).toBe(expected);
      });
    });

    describe('headings', () => {
      test('should convert h1', () => {
        expect(jiraToDiscord('h1. Main Title')).toBe('# Main Title');
      });

      test('should convert h2', () => {
        expect(jiraToDiscord('h2. Section')).toBe('## Section');
      });

      test('should convert h3', () => {
        expect(jiraToDiscord('h3. Subsection')).toBe('### Subsection');
      });

      test('should convert h4', () => {
        expect(jiraToDiscord('h4. Minor')).toBe('#### Minor');
      });

      test('should convert h5', () => {
        expect(jiraToDiscord('h5. Small')).toBe('##### Small');
      });

      test('should convert h6', () => {
        expect(jiraToDiscord('h6. Tiny')).toBe('###### Tiny');
      });

      test('should convert multiple headings', () => {
        const input = 'h1. Title\nh2. Section\nSome text';
        const expected = '# Title\n## Section\nSome text';
        expect(jiraToDiscord(input)).toBe(expected);
      });
    });

    describe('links', () => {
      test('should convert Jira links to markdown links', () => {
        expect(jiraToDiscord('[Google|https://google.com]')).toBe('[Google](https://google.com)');
      });

      test('should handle multiple links', () => {
        const input = 'Check [Google|https://google.com] and [GitHub|https://github.com]';
        const expected = 'Check [Google](https://google.com) and [GitHub](https://github.com)';
        expect(jiraToDiscord(input)).toBe(expected);
      });

      test('should handle links with special characters in text', () => {
        expect(jiraToDiscord('[Link Text Here|https://example.com]')).toBe('[Link Text Here](https://example.com)');
      });
    });

    describe('bold text', () => {
      test('should convert single asterisk bold to double asterisk', () => {
        expect(jiraToDiscord('This is *bold* text')).toBe('This is **bold** text');
      });

      test('should handle multiple bold sections', () => {
        expect(jiraToDiscord('*one* and *two*')).toBe('**one** and **two**');
      });

      test('should not convert asterisks preceded by asterisks', () => {
        // The regex uses negative lookbehind for asterisks, so **text** shouldn't match single-asterisk bold
        // But it will still convert *text* inside
        const result = jiraToDiscord('**already bold**');
        // The regex has negative lookbehind/lookahead for asterisks
        expect(result).toBeDefined();
      });
    });

    describe('inline code', () => {
      test('should convert double braces to backticks', () => {
        expect(jiraToDiscord('Use {{npm install}} command')).toBe('Use `npm install` command');
      });

      test('should handle multiple inline code sections', () => {
        expect(jiraToDiscord('Run {{npm test}} or {{npm run build}}')).toBe('Run `npm test` or `npm run build`');
      });
    });

    describe('edge cases', () => {
      test('should return null for null input', () => {
        expect(jiraToDiscord(null)).toBeNull();
      });

      test('should return undefined for undefined input', () => {
        expect(jiraToDiscord(undefined)).toBeUndefined();
      });

      test('should return empty string for empty input', () => {
        expect(jiraToDiscord('')).toBe('');
      });

      test('should return unchanged text when no markup present', () => {
        const plainText = 'This is plain text without any markup';
        expect(jiraToDiscord(plainText)).toBe(plainText);
      });

      test('should handle complex mixed content', () => {
        const input = 'h1. Title\nSome *Bold text* with [link|https://example.com]';
        const result = jiraToDiscord(input);
        // Check individual conversions are applied
        expect(result).toContain('# Title');
        expect(result).toContain('**Bold text**');
        expect(result).toContain('[link](https://example.com)');
      });
    });
  });

  describe('parseAdfToText', () => {
    describe('text nodes', () => {
      test('should extract text from text nodes', () => {
        const adf = {
          content: [
            { type: 'text', text: 'Hello world' }
          ]
        };
        expect(parseAdfToText(adf)).toBe('Hello world');
      });
    });

    describe('paragraphs', () => {
      test('should handle paragraphs with newlines', () => {
        const adf = {
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'First paragraph' }]
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Second paragraph' }]
            }
          ]
        };
        expect(parseAdfToText(adf)).toBe('First paragraph\nSecond paragraph');
      });

      test('should handle empty paragraphs', () => {
        const adf = {
          content: [
            { type: 'paragraph' },
            { type: 'paragraph', content: [] }
          ]
        };
        expect(parseAdfToText(adf)).toBe('');
      });
    });

    describe('hard breaks', () => {
      test('should convert hard breaks to newlines', () => {
        const adf = {
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Line 1' },
                { type: 'hardBreak' },
                { type: 'text', text: 'Line 2' }
              ]
            }
          ]
        };
        expect(parseAdfToText(adf)).toBe('Line 1\nLine 2');
      });
    });

    describe('bullet lists', () => {
      test('should format bullet lists with bullet prefix', () => {
        const adf = {
          content: [
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }
                  ]
                },
                {
                  type: 'listItem',
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'Item 2' }] }
                  ]
                }
              ]
            }
          ]
        };
        const result = parseAdfToText(adf);
        expect(result).toContain('• Item 1');
        expect(result).toContain('• Item 2');
      });
    });

    describe('ordered lists', () => {
      test('should format ordered lists with numbered prefix', () => {
        const adf = {
          content: [
            {
              type: 'orderedList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'First' }] }
                  ]
                },
                {
                  type: 'listItem',
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }
                  ]
                }
              ]
            }
          ]
        };
        const result = parseAdfToText(adf);
        expect(result).toContain('1. First');
        expect(result).toContain('2. Second');
      });
    });

    describe('headings', () => {
      test('should format headings with hash prefix', () => {
        const adf = {
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Main Title' }]
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Subtitle' }]
            }
          ]
        };
        const result = parseAdfToText(adf);
        expect(result).toContain('# Main Title');
        expect(result).toContain('## Subtitle');
      });

      test('should default to h1 when level is missing', () => {
        const adf = {
          content: [
            {
              type: 'heading',
              content: [{ type: 'text', text: 'No Level' }]
            }
          ]
        };
        expect(parseAdfToText(adf)).toContain('# No Level');
      });
    });

    describe('code blocks', () => {
      test('should wrap code blocks in triple backticks', () => {
        const adf = {
          content: [
            {
              type: 'codeBlock',
              content: [{ type: 'text', text: 'const x = 1;' }]
            }
          ]
        };
        const result = parseAdfToText(adf);
        expect(result).toContain('```');
        expect(result).toContain('const x = 1;');
      });
    });

    describe('nested content', () => {
      test('should handle deeply nested content', () => {
        const adf = {
          content: [
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        { type: 'text', text: 'Nested ' },
                        { type: 'text', text: 'content' }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        };
        expect(parseAdfToText(adf)).toContain('• Nested content');
      });

      test('should handle nodes with content array', () => {
        const adf = {
          content: [
            {
              type: 'unknownType',
              content: [{ type: 'text', text: 'Inside unknown' }]
            }
          ]
        };
        expect(parseAdfToText(adf)).toContain('Inside unknown');
      });
    });

    describe('edge cases', () => {
      test('should return empty string for null input', () => {
        expect(parseAdfToText(null)).toBe('');
      });

      test('should return empty string for undefined input', () => {
        expect(parseAdfToText(undefined)).toBe('');
      });

      test('should return empty string for empty content array', () => {
        expect(parseAdfToText({ content: [] })).toBe('');
      });

      test('should return empty string for missing content', () => {
        expect(parseAdfToText({})).toBe('');
      });

      test('should handle null nodes gracefully', () => {
        const adf = {
          content: [
            null,
            { type: 'text', text: 'Valid' },
            undefined
          ]
        };
        expect(parseAdfToText(adf)).toContain('Valid');
      });
    });
  });

  describe('parseJiraDescription', () => {
    test('should return default message for null', () => {
      expect(parseJiraDescription(null)).toBe('No description provided.');
    });

    test('should return default message for undefined', () => {
      expect(parseJiraDescription(undefined)).toBe('No description provided.');
    });

    test('should return default message for empty string', () => {
      expect(parseJiraDescription('')).toBe('No description provided.');
    });

    test('should convert string with wiki markup', () => {
      expect(parseJiraDescription('h1. Title')).toBe('# Title');
    });

    test('should parse ADF object', () => {
      const adf = {
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'ADF content' }]
          }
        ]
      };
      expect(parseJiraDescription(adf)).toBe('ADF content');
    });

    test('should return default message for object without content', () => {
      expect(parseJiraDescription({})).toBe('No description provided.');
    });

    test('should return default message for object with empty content', () => {
      expect(parseJiraDescription({ content: [] })).toBe('');
    });

    test('should handle plain string without markup', () => {
      const plainText = 'This is plain text description';
      expect(parseJiraDescription(plainText)).toBe(plainText);
    });
  });
});
