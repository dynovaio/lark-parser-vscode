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
            ...this.detectUndefinedSymbols(analysisResult),
            ...this.detectSyntaxErrors(analysisResult)
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
                    `Unused ${symbol.type === SymbolTypes.RULE ? 'rule' : symbol.type === SymbolTypes.TERMINAL ? 'terminal' : 'symbol'} '${symbolName}'`,
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
            let errorMessage = `Undefined symbol '${symbolEntry.name}'`;

            if (symbolEntry.type === SymbolTypes.TERMINAL) {
                errorMessage = `Undefined terminal '${symbolEntry.name}'`;
            }

            if (symbolEntry.type === SymbolTypes.RULE) {
                errorMessage = `Undefined rule '${symbolEntry.name}'`;
            }

            for (const usage of symbolEntry.usages) {
                if (usage.range) {
                    const diagnostic = new vscode.Diagnostic(
                        usage.range,
                        errorMessage,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostics.push(diagnostic);
                }
            }
        }

        return diagnostics;
    }

    private detectSyntaxErrors(analysisResult: AnalysisResult): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        for (const error of analysisResult.syntaxErrors) {
            const diagnostic = new vscode.Diagnostic(
                error.range,
                error.message,
                vscode.DiagnosticSeverity.Error
            );
            diagnostics.push(diagnostic);
        }
        return diagnostics;
    }
}
