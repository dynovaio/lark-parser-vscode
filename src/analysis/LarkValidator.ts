import * as vscode from 'vscode';
import { ImportResolver } from '@/features/ImportResolver';
import { SymbolResolver, SymbolDefinition } from '@/features/SymbolResolver';
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
 */
export class LarkValidator {
    private importResolver: ImportResolver;
    private symbolResolver: SymbolResolver;

    constructor () {
        this.importResolver = new ImportResolver();
        this.symbolResolver = new SymbolResolver();
    }

    /**
     * Validates a text document and updates diagnostics
     * @param document The document to validate
     * @param diagnosticCollection The collection to update with diagnostics
     */
    async validateTextDocument(document: vscode.TextDocument, diagnosticCollection: vscode.DiagnosticCollection): Promise<void> {
        if (document.languageId !== 'lark') { return; }

        // Collect all symbols from the document
        const documentSymbols = await this.collectAllSymbols(document);

        // Create symbol definitions mapping
        const symbolDefinitions = this.symbolResolver.createSymbolDefinitions(documentSymbols);

        // Mark symbols as used
        this.symbolResolver.markUsedSymbols(document, symbolDefinitions);

        // Collect all diagnostics
        const allDiagnostics: vscode.Diagnostic[] = [
            ...this.detectUnusedSymbols(document, symbolDefinitions),
            ...this.detectUndefinedSymbols(document, symbolDefinitions)
        ];

        diagnosticCollection.set(document.uri, allDiagnostics);
    }

    /**
     * Collects all symbols from a document (defined + imported)
     */
    private async collectAllSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
        // Get symbols from DocumentSymbolProvider
        const documentSymbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        ) || [];

        // Add imported symbols
        const importedSymbols = this.importResolver.collectImportedSymbols(document);
        documentSymbols.push(...importedSymbols);

        return documentSymbols;
    }

    /**
     * Detects unused symbols and creates warning diagnostics
     */
    private detectUnusedSymbols(document: vscode.TextDocument, symbolDefinitions: Record<string, SymbolDefinition>): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const unusedSymbols = this.symbolResolver.getUnusedSymbols(symbolDefinitions);

        for (const symbolName of unusedSymbols) {
            const lineNumber = this.symbolResolver.getSymbolDefinitionLine(symbolName, symbolDefinitions);
            if (lineNumber >= 0) {
                const line = document.lineAt(lineNumber);
                const startChar = line.text.indexOf(symbolName);

                if (startChar >= 0) {
                    const range = createSymbolRange(lineNumber, startChar, symbolName);
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Unused grammar symbol '${symbolName}'`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostics.push(diagnostic);
                }
            }
        }

        return diagnostics;
    }

    /**
     * Detects undefined symbols and creates error diagnostics
     */
    private detectUndefinedSymbols(document: vscode.TextDocument, symbolDefinitions: Record<string, SymbolDefinition>): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];

        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            const lineText = document.lineAt(lineIndex).text;

            // Skip directive lines and comments
            if (shouldSkipLine(lineText)) { continue; }

            // Process the line for symbol references
            this.processLineForUndefinedSymbols(
                lineText,
                lineIndex,
                symbolDefinitions,
                diagnostics
            );
        }

        return diagnostics;
    }    /**
     * Processes a single line to find undefined symbol references
     */
    private processLineForUndefinedSymbols(
        lineText: string,
        lineIndex: number,
        symbolDefinitions: Record<string, SymbolDefinition>,
        diagnostics: vscode.Diagnostic[]
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
        // This prevents cases like "comprehension{test}" from matching "test" as a regular rule
        const textWithoutParameterizedRules = searchableText.replace(/\b[a-z_][a-z_0-9]*\{[^}]*\}/g, '');

        // Check for undefined terminal references
        this.checkSymbolUsages(textWithoutParameterizedRules, searchOffset, lineIndex, symbolDefinitions, diagnostics, 'terminal', ruleParameters);

        // Check for undefined rule references (now without parameterized rules)
        this.checkSymbolUsages(textWithoutParameterizedRules, searchOffset, lineIndex, symbolDefinitions, diagnostics, 'rule', ruleParameters);

        // Check for undefined parameterized rule usages (using original text)
        this.checkParameterizedRuleUsages(searchableText, searchOffset, lineIndex, symbolDefinitions, diagnostics);
    }

    /**
     * Checks for undefined parameterized rule usages
     */
    private checkParameterizedRuleUsages(
        searchableText: string,
        searchOffset: number,
        lineIndex: number,
        symbolDefinitions: Record<string, SymbolDefinition>,
        diagnostics: vscode.Diagnostic[]
    ): void {
        let parameterizedMatch;
        while ((parameterizedMatch = PARAMETERIZED_RULE_USAGE_REGEX.exec(searchableText)) !== null) {
            const baseRuleName = parameterizedMatch[1];

            // Skip 'start' rule as it's special
            if (baseRuleName === 'start') {
                continue;
            }

            // Check if this base rule is defined (either as regular or parameterized rule)
            if (!this.symbolResolver.isBaseRuleDefined(baseRuleName, symbolDefinitions)) {
                const actualStartPosition = searchOffset + parameterizedMatch.index;
                const fullRuleUsage = parameterizedMatch[0]; // Full match like "rule{param}"
                const range = createSymbolRange(lineIndex, actualStartPosition, fullRuleUsage);

                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Undefined parameterized rule '${baseRuleName}'`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostics.push(diagnostic);
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
        symbolDefinitions: Record<string, SymbolDefinition>,
        diagnostics: vscode.Diagnostic[],
        symbolType: 'terminal' | 'rule',
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
            // Parameters like "comp_result" in "comprehension{comp_result}: comp_result ..." should not be validated
            if (symbolType === 'rule' && ruleParameters.includes(referencedSymbolName)) {
                continue;
            }

            if (!this.symbolResolver.isSymbolDefined(referencedSymbolName, symbolDefinitions)) {
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
