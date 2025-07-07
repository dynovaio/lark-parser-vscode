import * as vscode from 'vscode';
import { LarkSymbolTable } from './LarkSymbolTable';
import type { Scope, SymbolTableEntry } from './types.d';
import {
    TERMINAL_DEFINITION_REGEX,
    RULE_DEFINITION_REGEX,
    TERMINAL_USAGE_REGEX,
    RULE_USAGE_REGEX,
    PARAMETERIZED_RULE_USAGE_REGEX,
    PARAMETERIZED_RULE_DEFINITION_REGEX,
    DEFINITION_HEAD_REGEX,
    parseParameters
} from '../utils/LarkRegexPatterns';
import {
    shouldSkipLine,
    stripIgnoredContent,
    createSymbolRange
} from '../utils/DocumentUtils';

/**
 * Validates Lark grammar documents and provides diagnostics
 * The validator is now a stateless service that operates on a given symbol table.
 */
export class LarkValidator {
    // The validator is stateless and no longer holds a symbol table instance.

    constructor () {
    }

    /**
     * Validates a text document against a given symbol table and returns diagnostics.
     * @param document The document to validate.
     * @param symbolTable The symbol table to use for validation.
     * @returns An array of diagnostics.
     */
    public validate(document: vscode.TextDocument, symbolTable: LarkSymbolTable): vscode.Diagnostic[] {
        if (document.languageId !== 'lark') {
            return [];
        }

        // The validator no longer updates the symbol table. It consumes it.
        const allDiagnostics = [
            ...this.detectUnusedSymbols(document, symbolTable),
            ...this.detectUndefinedSymbols(document, symbolTable)
        ];

        return allDiagnostics;
    }

    /**
     * Detects unused symbols using the symbol table
     */
    private detectUnusedSymbols(document: vscode.TextDocument, symbolTable: LarkSymbolTable): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const unusedSymbols = symbolTable.getUnusedSymbols();

        for (const symbolName of unusedSymbols) {
            const symbol = symbolTable.resolveSymbol(symbolName);
            if (symbol) {
                const range = symbol.location.range;
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Unused grammar symbol '${symbolName}'`,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostics.push(diagnostic);
            }
        }

        return diagnostics;
    }

    /**
     * Detects undefined symbols using scope-aware validation
     */
    private detectUndefinedSymbols(document: vscode.TextDocument, symbolTable: LarkSymbolTable): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];

        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            const lineText = document.lineAt(lineIndex).text;

            // Skip directive lines and comments
            if (shouldSkipLine(lineText)) {
                continue;
            }

            // Get the scope for this line
            const linePosition = new vscode.Position(lineIndex, 0);
            const scope = symbolTable.getCurrentScope(linePosition);

            // Process the line for symbol references with scope awareness
            this.processLineForUndefinedSymbols(
                lineText,
                lineIndex,
                scope,
                diagnostics,
                symbolTable
            );
        }

        return diagnostics;
    }

    /**
     * Processes a single line to find undefined symbol references
     */
    private processLineForUndefinedSymbols(
        lineText: string,
        lineIndex: number,
        scope: Scope,
        diagnostics: vscode.Diagnostic[],
        symbolTable: LarkSymbolTable
    ): void {
        let searchableText = lineText;
        let searchOffset = 0;
        let ruleParameters: string[] = []; // Parameters for parameterized rules

        // Check if this line contains a definition
        const terminalDefMatch = TERMINAL_DEFINITION_REGEX.exec(lineText);
        const ruleDefMatch = RULE_DEFINITION_REGEX.exec(lineText);
        const parameterizedRuleDefMatch = PARAMETERIZED_RULE_DEFINITION_REGEX.exec(lineText);
        const definitionHeadMatch = DEFINITION_HEAD_REGEX.exec(lineText);

        if (terminalDefMatch || ruleDefMatch) {
            // Skip the definition part, only analyze the right side of ':'
            const colonIndex = lineText.indexOf(':');
            if (colonIndex >= 0) {
                searchOffset = colonIndex + 1;
                searchableText = lineText.slice(searchOffset);
            }

            // If this is a parameterized rule definition, extract parameters
            if (parameterizedRuleDefMatch) {
                const parametersString = parameterizedRuleDefMatch[2];
                ruleParameters = parseParameters(parametersString);
            }
        } else if (definitionHeadMatch) {
            // Report error for invalid definition head
            const invalidHead = definitionHeadMatch[1];
            const startIndex = lineText.indexOf(invalidHead);
            const endIndex = startIndex + invalidHead.length;
            const range = new vscode.Range(lineIndex, startIndex, lineIndex, endIndex);

            const diagnostic = new vscode.Diagnostic(
                range,
                `Invalid definition name '${invalidHead}'`,
                vscode.DiagnosticSeverity.Error
            );
            diagnostics.push(diagnostic);
            return;
        }

        // Strip content that should be ignored
        searchableText = stripIgnoredContent(searchableText);

        // First, remove parameterized rule usages to avoid false matches in regular rule processing
        const textWithoutParameterizedRules = searchableText.replace(/\b[a-z_][a-z_0-9]*\{[^}]*\}/g, '');

        // Check for undefined symbols with scope awareness
        this.checkSymbolUsages(textWithoutParameterizedRules, searchOffset, lineIndex, scope, diagnostics, 'terminal', symbolTable, ruleParameters);
        this.checkSymbolUsages(textWithoutParameterizedRules, searchOffset, lineIndex, scope, diagnostics, 'rule', symbolTable, ruleParameters);

        // Check for undefined parameterized rule usages (using original text)
        this.checkParameterizedRuleUsages(searchableText, searchOffset, lineIndex, scope, diagnostics, symbolTable);
    }

    /**
     * Checks for undefined parameterized rule usages
     */
    private checkParameterizedRuleUsages(
        searchableText: string,
        searchOffset: number,
        lineIndex: number,
        scope: Scope,
        diagnostics: vscode.Diagnostic[],
        symbolTable: LarkSymbolTable
    ): void {
        let parameterizedMatch;
        while ((parameterizedMatch = PARAMETERIZED_RULE_USAGE_REGEX.exec(searchableText)) !== null) {
            const baseRuleName = parameterizedMatch[1];
            const fullRuleUsage = parameterizedMatch[0]; // Full match like "rule{param}"

            // Skip 'start' rule as it's special
            if (baseRuleName === 'start') {
                continue;
            }

            // Use scope-aware resolution
            const resolvedRule = symbolTable.resolveParameterizedRule(baseRuleName, scope);
            if (!resolvedRule) {
                const actualStartPosition = searchOffset + parameterizedMatch.index;
                const range = createSymbolRange(lineIndex, actualStartPosition, fullRuleUsage);

                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Undefined parameterized rule '${baseRuleName}'`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostics.push(diagnostic);
            } else {
                // Validate parameter arguments if the rule is found
                const argsMatch = fullRuleUsage.match(/\{([^}]+)\}/);
                if (argsMatch) {
                    const argsString = argsMatch[1];
                    const args = argsString.split(',').map(arg => arg.trim());
                    const validationResults = symbolTable.validateParameterArguments(baseRuleName, args, scope);

                    for (const result of validationResults) {
                        if (!result.isValid && result.errorRange) {
                            // Adjust range to be relative to the document
                            const adjustedRange = new vscode.Range(
                                lineIndex,
                                searchOffset + result.errorRange.start.character,
                                lineIndex,
                                searchOffset + result.errorRange.end.character
                            );

                            const diagnostic = new vscode.Diagnostic(
                                adjustedRange,
                                result.errorMessage || 'Invalid parameter argument',
                                vscode.DiagnosticSeverity.Error
                            );
                            diagnostics.push(diagnostic);
                        }
                    }
                }
            }
        }
    }

    /**
     * Checks for undefined symbol usages of a specific type
     */
    private checkSymbolUsages(
        searchableText: string,
        searchOffset: number,
        lineIndex: number,
        scope: Scope,
        diagnostics: vscode.Diagnostic[],
        symbolType: 'terminal' | 'rule',
        symbolTable: LarkSymbolTable,
        ruleParameters: string[] = []
    ): void {
        const usageRegex = symbolType === 'terminal' ? TERMINAL_USAGE_REGEX : RULE_USAGE_REGEX;

        let usageMatch;
        while ((usageMatch = usageRegex.exec(searchableText)) !== null) {
            const referencedSymbolName = usageMatch[1];

            // Skip 'start' rule as it's special
            if (symbolType === 'rule' && referencedSymbolName === 'start') {
                continue;
            }

            // Skip if this is a parameter in a parameterized rule definition
            if (symbolType === 'rule' && ruleParameters.includes(referencedSymbolName)) {
                continue;
            }

            // Use scope-aware resolution
            const resolvedSymbol = symbolTable.resolveSymbol(referencedSymbolName, scope);
            if (!resolvedSymbol) {
                const actualStartPosition = searchOffset + usageMatch.index;
                const range = createSymbolRange(lineIndex, actualStartPosition, referencedSymbolName);

                const errorMessage = symbolType === 'terminal'
                    ? `Undefined terminal '${referencedSymbolName}'`
                    : `Undefined rule '${referencedSymbolName}'`;

                const diagnostic = new vscode.Diagnostic(
                    range,
                    errorMessage,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostics.push(diagnostic);
            }
        }
    }
}
