import * as vscode from 'vscode';
import { LarkDocumentManager } from '../orchestration/LarkDocumentManager';

/**
 * Provides document symbols for Lark grammar files.
 * Implements VS Code's DocumentSymbolProvider interface.
 * Uses the LarkDocumentManager to get the symbol table for a document.
 */
export class LarkSymbolProvider implements vscode.DocumentSymbolProvider {
    private manager: LarkDocumentManager;

    constructor (manager: LarkDocumentManager) {
        this.manager = manager;
    }

    /**
     * Analyzes a document and returns all symbol definitions.
     * @param document The document to analyze.
     * @returns Array of DocumentSymbol objects representing all symbols in the document.
     */
    async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
        const symbolTable = this.manager.getSymbolTable(document.uri);
        if (symbolTable) {
            return symbolTable.getDocumentSymbols();
        }
        return [];
    }
}
