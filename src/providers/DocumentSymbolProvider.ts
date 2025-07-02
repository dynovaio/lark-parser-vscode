import * as vscode from 'vscode';
import {
    TERMINAL_DEFINITION_REGEX,
    RULE_DEFINITION_REGEX,
    PARAMETERIZED_RULE_DEFINITION_REGEX,
    parseParameters
} from '@/utils/LarkRegexPatterns';
import { createLineRange } from '@/utils/DocumentUtils';

/**
 * Provides document symbols for Lark grammar files
 * Implements VS Code's DocumentSymbolProvider interface
 */
export class LarkSymbolProvider implements vscode.DocumentSymbolProvider {
    /**
     * Analyzes a document and returns all symbol definitions
     * @param document The document to analyze
     * @returns Array of DocumentSymbol objects representing all symbols in the document
     */
    provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const documentSymbols: vscode.DocumentSymbol[] = [];

        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            const lineText = document.lineAt(lineIndex).text;

            // Try to match terminal definitions first
            const terminalMatch = TERMINAL_DEFINITION_REGEX.exec(lineText);
            if (terminalMatch) {
                const symbol = this.createDocumentSymbol(
                    terminalMatch[1],
                    lineIndex,
                    lineText,
                    vscode.SymbolKind.Constant
                );
                documentSymbols.push(symbol);
                continue;
            }

            // Try to match parameterized rule definitions
            const parameterizedRuleMatch = PARAMETERIZED_RULE_DEFINITION_REGEX.exec(lineText);
            if (parameterizedRuleMatch) {
                const ruleName = parameterizedRuleMatch[1];
                const parameterString = parameterizedRuleMatch[2];
                const parameters = parseParameters(parameterString);

                // Create display name with parameters
                const displayName = parameters.length > 0
                    ? `${ruleName}{${parameters.join(', ')}}`
                    : `${ruleName}{}`;

                const symbol = this.createDocumentSymbol(
                    displayName,
                    lineIndex,
                    lineText,
                    vscode.SymbolKind.Function,
                    'parameterized rule'
                );
                documentSymbols.push(symbol);
                continue;
            }

            // Try to match regular rule definitions
            const ruleMatch = RULE_DEFINITION_REGEX.exec(lineText);
            if (ruleMatch) {
                // Check if this might be a parameterized rule that we missed
                if (lineText.includes('{') && lineText.includes('}')) {
                    // This is likely a parameterized rule, but our regex didn't catch it
                    // Extract the full rule name including parameters manually
                    const colonIndex = lineText.indexOf(':');
                    if (colonIndex > 0) {
                        const beforeColon = lineText.substring(0, colonIndex).trim();
                        const ruleNameMatch = beforeColon.match(/^(?:\s*[?!]?)?\s*([a-z_][a-z_0-9]*(?:\{[^}]*\})?)/);
                        if (ruleNameMatch) {
                            const symbol = this.createDocumentSymbol(
                                ruleNameMatch[1],
                                lineIndex,
                                lineText,
                                vscode.SymbolKind.Function,
                                'rule'
                            );
                            documentSymbols.push(symbol);
                            continue;
                        }
                    }
                }

                // Regular rule (no parameters)
                const symbol = this.createDocumentSymbol(
                    ruleMatch[1],
                    lineIndex,
                    lineText,
                    vscode.SymbolKind.Function,
                    'rule'
                );
                documentSymbols.push(symbol);
            }
        }

        return documentSymbols;
    }

    /**
     * Creates a DocumentSymbol object for a matched symbol
     * @param symbolName The name of the symbol
     * @param lineIndex The line number where the symbol is defined
     * @param lineText The full text of the line
     * @param symbolKind The kind of symbol (Constant for terminals, Function for rules)
     * @param detail Optional detail text for the symbol
     * @returns A new DocumentSymbol object
     */
    private createDocumentSymbol(
        symbolName: string,
        lineIndex: number,
        lineText: string,
        symbolKind: vscode.SymbolKind,
        detail: string = ''
    ): vscode.DocumentSymbol {
        const symbolRange = createLineRange(lineIndex, lineText);
        return new vscode.DocumentSymbol(symbolName, detail, symbolKind, symbolRange, symbolRange);
    }
}
