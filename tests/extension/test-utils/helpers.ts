/**
 * Shared test helper functions and utilities for the Lark Parser VS Code extension tests.
 */

/**
 * Creates a sample Lark grammar content for testing purposes.
 * @param ruleName The name of the main rule
 * @param content Additional grammar content
 * @returns A formatted Lark grammar string
 */
export function createSampleGrammar(ruleName: string = 'start', content: string = ''): string {
    return `${ruleName}: ${content || 'expr'}\n\nexpr: NUMBER\n\nNUMBER: /[0-9]+/\n\n%import common.WS\n%ignore WS`;
}

/**
 * Creates a complex grammar for testing advanced symbol resolution.
 * @returns A complex Lark grammar with multiple rules and imports
 */
export function createComplexGrammar(): string {
    return `
// Main calculator grammar
start: expr

// Expression rules
expr: term ("+" term | "-" term)*
term: factor ("*" factor | "/" factor)*
factor: NUMBER | "(" expr ")"

// Terminal definitions
NUMBER: /[0-9]+/
IDENTIFIER: /[a-zA-Z_][a-zA-Z0-9_]*/

// Comments and whitespace
COMMENT: "//" /[^\\n]*/
%import common.WS
%ignore WS
%ignore COMMENT
`.trim();
}

/**
 * Normalizes line endings for cross-platform testing.
 * @param content The content to normalize
 * @returns Content with normalized line endings
 */
export function normalizeContent(content: string): string {
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
