import * as vscode from 'vscode';

/**
 * Interface for symbol definition information
 */
export interface SymbolDefinition {
    line: number;
    used: boolean;
}

/**
 * Manages symbol definitions and their usage tracking
 */
export class SymbolResolver {
    /**
     * Creates a flat mapping of symbol names to their definitions
     * @param symbolList Array of DocumentSymbol objects (potentially nested)
     * @returns Record mapping symbol names to their definition info
     */
    public createSymbolDefinitions(symbolList: vscode.DocumentSymbol[]): Record<string, SymbolDefinition> {
        const symbolDefinitions: Record<string, SymbolDefinition> = {};
        const symbolStack: vscode.DocumentSymbol[] = [...symbolList];

        while (symbolStack.length > 0) {
            const currentSymbol = symbolStack.pop()!;
            symbolDefinitions[currentSymbol.name] = {
                line: currentSymbol.range.start.line,
                used: false
            };

            if (currentSymbol.children && currentSymbol.children.length) {
                symbolStack.push(...currentSymbol.children);
            }
        }

        return symbolDefinitions;
    }

    /**
     * Marks symbols as used by scanning the document for references
     * @param document The document to scan
     * @param symbolDefinitions The symbol definitions to update
     */
    public markUsedSymbols(document: vscode.TextDocument, symbolDefinitions: Record<string, SymbolDefinition>): void {
        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            const lineText = document.lineAt(lineIndex).text;

            for (const symbolName in symbolDefinitions) {
                // Skip if already marked as used or if this is the definition line
                if (symbolDefinitions[symbolName].used || lineIndex === symbolDefinitions[symbolName].line) {
                    continue;
                }

                // Check if the symbol is referenced in this line
                if (new RegExp(`\\b${symbolName}\\b`).test(lineText)) {
                    symbolDefinitions[symbolName].used = true;
                }
            }
        }
    }

    /**
     * Checks if a symbol is defined in the symbol definitions
     * @param symbolName The name of the symbol to check
     * @param symbolDefinitions The symbol definitions to search
     * @returns True if the symbol is defined
     */
    public isSymbolDefined(symbolName: string, symbolDefinitions: Record<string, SymbolDefinition>): boolean {
        return symbolDefinitions.hasOwnProperty(symbolName);
    }

    /**
     * Gets all unused symbols (excluding 'start' which is special)
     * @param symbolDefinitions The symbol definitions to check
     * @returns Array of symbol names that are unused
     */
    public getUnusedSymbols(symbolDefinitions: Record<string, SymbolDefinition>): string[] {
        const unusedSymbols: string[] = [];

        for (const symbolName in symbolDefinitions) {
            if (!symbolDefinitions[symbolName].used && symbolName !== 'start') {
                unusedSymbols.push(symbolName);
            }
        }

        return unusedSymbols;
    }

    /**
     * Gets the line number where a symbol is defined
     * @param symbolName The name of the symbol
     * @param symbolDefinitions The symbol definitions to search
     * @returns The line number or -1 if not found
     */
    public getSymbolDefinitionLine(symbolName: string, symbolDefinitions: Record<string, SymbolDefinition>): number {
        const definition = symbolDefinitions[symbolName];
        return definition ? definition.line : -1;
    }
}
