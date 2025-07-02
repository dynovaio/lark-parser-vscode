import * as vscode from 'vscode';
import { LarkSymbolTable } from '@/analysis/LarkSymbolTable';

/**
 * Provides document symbols for Lark grammar files
 * Implements VS Code's DocumentSymbolProvider interface
 * Uses the LarkSymbolTable for centralized symbol management
 */
export class LarkSymbolProvider implements vscode.DocumentSymbolProvider {
    private symbolTable!: LarkSymbolTable;

    /**
     * Sets the symbol table for symbol resolution
     * @param symbolTable The LarkSymbolTable instance
     */
    setSymbolTable(symbolTable: LarkSymbolTable): void {
        this.symbolTable = symbolTable;
    }

    /**
     * Analyzes a document and returns all symbol definitions
     * @param document The document to analyze
     * @returns Array of DocumentSymbol objects representing all symbols in the document
     */
    async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
        // Ensure symbol table is up to date as planned in architecture
        await this.symbolTable.updateFromDocument(document);
        return this.symbolTable.getDocumentSymbols();
    }
}
