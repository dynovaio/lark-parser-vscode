import * as vscode from 'vscode';
import {
    SIMPLE_IMPORT_REGEX,
    MULTI_IMPORT_REGEX,
    ALIAS_PATTERN_REGEX
} from '@/utils/LarkRegexPatterns';
import { isTerminalName, createLineRange } from '@/utils/DocumentUtils';

/**
 * Resolves and processes import statements in Lark grammar files
 */
export class ImportResolver {
    /**
     * Collects all imported symbols from a document
     * @param document The VS Code document to analyze
     * @returns Array of DocumentSymbol objects representing imported symbols
     */
    public collectImportedSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const importedSymbolList: vscode.DocumentSymbol[] = [];

        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            const lineText = document.lineAt(lineIndex).text;
            const symbolRange = createLineRange(lineIndex, lineText);

            // Try simple import first
            const simpleSymbols = this.parseSimpleImport(lineText, symbolRange);
            if (simpleSymbols.length > 0) {
                importedSymbolList.push(...simpleSymbols);
                continue;
            }

            // Try multi-import
            const multiSymbols = this.parseMultiImport(lineText, symbolRange);
            if (multiSymbols.length > 0) {
                importedSymbolList.push(...multiSymbols);
            }
        }

        return importedSymbolList;
    }

    /**
     * Parses simple import statements: %import module.SYMBOL or %import module.SYMBOL -> ALIAS
     */
    private parseSimpleImport(lineText: string, symbolRange: vscode.Range): vscode.DocumentSymbol[] {
        const simpleMatch = SIMPLE_IMPORT_REGEX.exec(lineText);
        if (!simpleMatch) {return [];}

        const moduleName = simpleMatch[1];
        const originalSymbolName = simpleMatch[2];
        const aliasedSymbolName = simpleMatch[3]; // Optional alias

        // Use the alias if provided, otherwise use the original name
        const finalSymbolName = aliasedSymbolName || originalSymbolName;

        // Determine symbol kind based on naming convention
        const symbolKind = isTerminalName(finalSymbolName) ? vscode.SymbolKind.Constant : vscode.SymbolKind.Function;

        const documentSymbol = new vscode.DocumentSymbol(
            finalSymbolName,
            `Imported from ${moduleName}.${originalSymbolName}${aliasedSymbolName ? ` as ${aliasedSymbolName}` : ''}`,
            symbolKind,
            symbolRange,
            symbolRange
        );

        return [documentSymbol];
    }

    /**
     * Parses multi-import statements: %import module (SYMBOL1, SYMBOL2, ...)
     */
    private parseMultiImport(lineText: string, symbolRange: vscode.Range): vscode.DocumentSymbol[] {
        const multiMatch = MULTI_IMPORT_REGEX.exec(lineText);
        if (!multiMatch) {return [];}

        const moduleName = multiMatch[1];
        const symbolsListText = multiMatch[2];

        // Parse the comma-separated list of symbols
        const symbolNames = symbolsListText.split(',').map(s => s.trim()).filter(s => s.length > 0);
        const importedSymbols: vscode.DocumentSymbol[] = [];

        for (const symbolName of symbolNames) {
            // Check if this symbol has an alias: symbol -> alias
            const aliasMatch = ALIAS_PATTERN_REGEX.exec(symbolName);

            let finalSymbolName: string;
            let originalSymbolName: string;

            if (aliasMatch) {
                originalSymbolName = aliasMatch[1];
                finalSymbolName = aliasMatch[2];
            } else {
                originalSymbolName = symbolName;
                finalSymbolName = symbolName;
            }

            // Determine symbol kind based on naming convention
            const symbolKind = isTerminalName(finalSymbolName) ? vscode.SymbolKind.Constant : vscode.SymbolKind.Function;

            const documentSymbol = new vscode.DocumentSymbol(
                finalSymbolName,
                `Imported from ${moduleName}.${originalSymbolName}${aliasMatch ? ` as ${finalSymbolName}` : ''}`,
                symbolKind,
                symbolRange,
                symbolRange
            );

            importedSymbols.push(documentSymbol);
        }

        return importedSymbols;
    }
}
