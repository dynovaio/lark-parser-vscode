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
} from '@/utils/LarkRegexPatterns';
import {
    shouldSkipLine,
    stripIgnoredContent,
    createSymbolRange
} from '@/utils/DocumentUtils';

/**
 * Validates Lark grammar documents and provides diagnostics
 * Uses LarkSymbolTable for scope-aware validation
 */
export class LarkValidator {
    private symbolTable!: LarkSymbolTable;

    constructor () {
    }

    /**
     * Sets the symbol table for scope-aware validation
     * @param symbolTable The symbol table to use for validation
     */
    public setSymbolTable(symbolTable: LarkSymbolTable): void {
        this.symbolTable = symbolTable;
    }

    /**
     * Validates a text document and updates diagnostics
     * @param document The document to validate
     * @param diagnosticCollection The collection to update with diagnostics
     */
    async validateTextDocument(document: vscode.TextDocument, diagnosticCollection: vscode.DiagnosticCollection): Promise<void> {
        if (document.languageId !== 'lark') {
            return;
        }

        // Use symbol table for scope-aware validation
        await this.symbolTable.updateFromDocument(document);

        const allDiagnostics = [
            ...this.detectUnusedSymbols(document),
            ...this.detectUndefinedSymbols(document)
        ];

        diagnosticCollection.set(document.uri, allDiagnostics);
    }

    /**
     * Detects unused symbols using the symbol table
     */
    private detectUnusedSymbols(document: vscode.TextDocument): vscode.Diagnostic[] {
        if (!this.symbolTable) {
            return [];
        }

        const diagnostics: vscode.Diagnostic[] = [];
        const unusedSymbols = this.symbolTable.getUnusedSymbols();

        for (const symbolName of unusedSymbols) {
            const symbol = this.symbolTable.resolveSymbol(symbolName);
            if (symbol) {
                const range = symbol.definition.range;
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
    private detectUndefinedSymbols(document: vscode.TextDocument): vscode.Diagnostic[] {
        if (!this.symbolTable) {
            return [];
        }

        const diagnostics: vscode.Diagnostic[] = [];

        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            const lineText = document.lineAt(lineIndex).text;

            // Skip directive lines and comments
            if (shouldSkipLine(lineText)) {
                continue;
            }

            // Get the scope for this line
            const linePosition = new vscode.Position(lineIndex, 0);
            const scope = this.symbolTable.getCurrentScope(linePosition);

            // Process the line for symbol references with scope awareness
            this.processLineForUndefinedSymbols(
                lineText,
                lineIndex,
                scope,
                diagnostics
            );
        }

        return diagnostics;
    }

    /**
     * Processes a single line to find undefined symbol references (modern scope-aware version)
     */
    private processLineForUndefinedSymbols(
        lineText: string,
        lineIndex: number,
        scope: Scope,
        diagnostics: vscode.Diagnostic[]
    ): void {
        if (!this.symbolTable) {
            return;
        }

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
        this.checkSymbolUsages(textWithoutParameterizedRules, searchOffset, lineIndex, scope, diagnostics, 'terminal', ruleParameters);
        this.checkSymbolUsages(textWithoutParameterizedRules, searchOffset, lineIndex, scope, diagnostics, 'rule', ruleParameters);

        // Check for undefined parameterized rule usages (using original text)
        this.checkParameterizedRuleUsages(searchableText, searchOffset, lineIndex, scope, diagnostics);
    }

    /**
     * Checks for undefined parameterized rule usages (modern scope-aware version)
     */
    private checkParameterizedRuleUsages(
        searchableText: string,
        searchOffset: number,
        lineIndex: number,
        scope: Scope,
        diagnostics: vscode.Diagnostic[]
    ): void {
        if (!this.symbolTable) {
            return;
        }

        let parameterizedMatch;
        while ((parameterizedMatch = PARAMETERIZED_RULE_USAGE_REGEX.exec(searchableText)) !== null) {
            const baseRuleName = parameterizedMatch[1];
            const fullRuleUsage = parameterizedMatch[0]; // Full match like "rule{param}"

            // Skip 'start' rule as it's special
            if (baseRuleName === 'start') {
                continue;
            }

            // Use scope-aware resolution
            const resolvedRule = this.symbolTable.resolveParameterizedRule(baseRuleName, scope);
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
                    const validationResults = this.symbolTable.validateParameterArguments(baseRuleName, args, scope);

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
     * Checks for undefined symbol usages of a specific type (modern scope-aware version)
     */
    private checkSymbolUsages(
        searchableText: string,
        searchOffset: number,
        lineIndex: number,
        scope: Scope,
        diagnostics: vscode.Diagnostic[],
        symbolType: 'terminal' | 'rule',
        ruleParameters: string[] = []
    ): void {
        if (!this.symbolTable) {
            return;
        }

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
            const resolvedSymbol = this.symbolTable.resolveSymbol(referencedSymbolName, scope);
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
