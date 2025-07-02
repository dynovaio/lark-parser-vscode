import * as vscode from 'vscode';
import { TERMINAL_NAME_CHECK_REGEX } from '@/utils/LarkRegexPatterns';

/**
 * Utility functions for working with VS Code documents and Lark grammar files
 */

/**
 * Determines if a symbol name follows the terminal naming convention
 * @param symbolName The symbol name to check
 * @returns True if it's a terminal name (uppercase with underscores and numbers)
 */
export function isTerminalName(symbolName: string): boolean {
    return TERMINAL_NAME_CHECK_REGEX.test(symbolName);
}

/**
 * Creates a VS Code range for a symbol occurrence in a line
 * @param lineIndex The line number (0-based)
 * @param startChar The starting character position
 * @param symbolName The symbol name to calculate end position
 * @returns VS Code Range object
 */
export function createSymbolRange(lineIndex: number, startChar: number, symbolName: string): vscode.Range {
    return new vscode.Range(lineIndex, startChar, lineIndex, startChar + symbolName.length);
}

/**
 * Creates a VS Code range for an entire line
 * @param lineIndex The line number (0-based)
 * @param lineText The text content of the line
 * @returns VS Code Range object spanning the entire line
 */
export function createLineRange(lineIndex: number, lineText: string): vscode.Range {
    return new vscode.Range(lineIndex, 0, lineIndex, lineText.length);
}

/**
 * Strips text content that should be ignored during symbol analysis
 * @param text The text to process
 * @returns Processed text with strings, comments, and regex patterns replaced with spaces
 */
export function stripIgnoredContent(text: string): string {
    let processedText = text;

    // Strip literal strings in quotes
    processedText = processedText.replace(/"[^"]*"/g, (match) => ' '.repeat(match.length));

    // Strip comments and aliases (stop at // or ->)
    processedText = processedText.split(/\/\/|->/)[0];

    // Strip regex patterns
    processedText = processedText.replace(/(\/(?:\\.|[^\/\\])*\/[gimsuy]*)/g, (match) => ' '.repeat(match.length));

    return processedText;
}

/**
 * Checks if a line should be skipped during analysis
 * @param lineText The text content of the line
 * @returns True if the line should be skipped (directive or comment)
 */
export function shouldSkipLine(lineText: string): boolean {
    const trimmed = lineText.trim();
    return trimmed.startsWith('%') || trimmed.startsWith('//');
}
