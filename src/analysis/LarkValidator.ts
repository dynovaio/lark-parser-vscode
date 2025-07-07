import * as vscode from 'vscode';
import { LarkSymbolTable, SymbolTypes } from './LarkSymbolTable';
import type { AnalysisResult } from './types.d';

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
     * @param analysisResult The symbol table to use for validation.
     * @returns An array of diagnostics.
     */
    public validate(document: vscode.TextDocument, analysisResult: AnalysisResult): vscode.Diagnostic[] {
        if (document.languageId !== 'lark') {
            return [];
        }

        const allDiagnostics = [
            ...this.detectUnusedSymbols(analysisResult),
            ...this.detectUndefinedSymbols(analysisResult)
        ];

        return allDiagnostics;
    }

    /**
     * Detects unused symbols using the symbol table
     */
    private detectUnusedSymbols(analysisResult: AnalysisResult): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const symbolTable = analysisResult.symbolTable as LarkSymbolTable;
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
    private detectUndefinedSymbols(analysisResult: AnalysisResult): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const undefinedSymbolTable = analysisResult.undefinedSymbolTable;

        for (const [, symbolEntry] of undefinedSymbolTable.entries()) {
            let errorMessage = `Invalid definition name '${symbolEntry.name}'`;

            if (symbolEntry.type === SymbolTypes.TERMINAL) {
                errorMessage = `Invalid terminal name '${symbolEntry.name}'`;
            }

            if (symbolEntry.type === SymbolTypes.RULE) {
                errorMessage = `Invalid rule name '${symbolEntry.name}'`;
            }

            const diagnostic = new vscode.Diagnostic(
                symbolEntry.location.range,
                errorMessage,
                vscode.DiagnosticSeverity.Error
            );

            diagnostics.push(diagnostic);
        }

        return diagnostics;
    }
}
