import * as vscode from 'vscode';
import {
    TERMINAL_DEFINITION_REGEX,
    RULE_DEFINITION_REGEX
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

            // Try to match rule definitions
            const ruleMatch = RULE_DEFINITION_REGEX.exec(lineText);
            if (ruleMatch) {
                const symbol = this.createDocumentSymbol(
                    ruleMatch[1],
                    lineIndex,
                    lineText,
                    vscode.SymbolKind.Function
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
     * @returns A new DocumentSymbol object
     */
    private createDocumentSymbol(
        symbolName: string,
        lineIndex: number,
        lineText: string,
        symbolKind: vscode.SymbolKind
    ): vscode.DocumentSymbol {
        const symbolRange = createLineRange(lineIndex, lineText);
        return new vscode.DocumentSymbol(symbolName, '', symbolKind, symbolRange, symbolRange);
    }
}
