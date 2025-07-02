import * as vscode from 'vscode';
import { PARAMETERIZED_RULE_USAGE_REGEX } from '@/utils/LarkRegexPatterns';
import { LarkSymbolTable } from '../analysis/LarkSymbolTable';
import type { Scope, SymbolTableEntry, ValidationResult, ParameterInfo } from '../analysis/types.d';

/**
 * Interface for symbol definition information
 */
export interface SymbolDefinition {
    line: number;
    used: boolean;
    isParameterized?: boolean;
    baseRuleName?: string; // For parameterized rules, the base rule name without parameters
}

/**
 * Manages symbol definitions and their usage tracking
 * Now integrates with LarkSymbolTable for centralized symbol management
 */
export class SymbolResolver {
    private symbolTable: LarkSymbolTable | null = null;

    /**
     * Sets the symbol table for modern symbol resolution
     * @param symbolTable The symbol table to use for resolution
     */
    public setSymbolTable(symbolTable: LarkSymbolTable): void {
        this.symbolTable = symbolTable;
    }

    /**
     * Creates a flat mapping of symbol names to their definitions
     * @param symbolList Array of DocumentSymbol objects (potentially nested)
     * @returns Record mapping symbol names to their definition info
     */
    public createSymbolDefinitions(symbolList?: vscode.DocumentSymbol[]): Record<string, SymbolDefinition> {
        // If symbol table is available, delegate to it
        if (this.symbolTable) {
            return this.symbolTable.getSymbolDefinitions();
        }

        // Fallback to legacy implementation
        if (!symbolList) {
            return {};
        }

        const symbolDefinitions: Record<string, SymbolDefinition> = {};
        const symbolStack: vscode.DocumentSymbol[] = [...symbolList];

        while (symbolStack.length > 0) {
            const currentSymbol = symbolStack.pop()!;

            // Check if this is a parameterized rule
            const isParameterized = currentSymbol.name.includes('{') && currentSymbol.name.includes('}');
            let baseRuleName = currentSymbol.name;

            if (isParameterized) {
                // Extract base rule name (everything before the '{')
                const braceIndex = currentSymbol.name.indexOf('{');
                baseRuleName = currentSymbol.name.substring(0, braceIndex);
            }

            symbolDefinitions[currentSymbol.name] = {
                line: currentSymbol.range.start.line,
                used: false,
                isParameterized,
                baseRuleName
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
     * @param symbolDefinitions The symbol definitions to update (optional when using symbol table)
     */
    public markUsedSymbols(document: vscode.TextDocument, symbolDefinitions?: Record<string, SymbolDefinition>): void {
        // If symbol table is available, delegate to it
        if (this.symbolTable) {
            // Symbol table handles usage marking during document analysis
            // This is a no-op when using symbol table as usage is tracked automatically
            return;
        }

        // Fallback to legacy implementation
        if (!symbolDefinitions) {
            return;
        }

        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            const lineText = document.lineAt(lineIndex).text;

            // First, check for parameterized rule usages
            const parameterizedMatches = Array.from(lineText.matchAll(PARAMETERIZED_RULE_USAGE_REGEX));
            for (const match of parameterizedMatches) {
                const usedBaseRuleName = match[1]; // The rule name without parameters

                // Mark any parameterized rule with this base name as used
                for (const symbolName in symbolDefinitions) {
                    const symbolDef = symbolDefinitions[symbolName];
                    if (!symbolDef.used &&
                        symbolDef.isParameterized &&
                        symbolDef.baseRuleName === usedBaseRuleName &&
                        lineIndex !== symbolDef.line) {
                        symbolDef.used = true;
                    }
                }
            }

            // Then check for regular symbol usages
            for (const symbolName in symbolDefinitions) {
                const symbolDef = symbolDefinitions[symbolName];

                // Skip if already marked as used or if this is the definition line
                if (symbolDef.used || lineIndex === symbolDef.line) {
                    continue;
                }

                // For parameterized rules, check if base rule name is used
                if (symbolDef.isParameterized && symbolDef.baseRuleName) {
                    if (new RegExp(`\\b${symbolDef.baseRuleName}\\b`).test(lineText)) {
                        symbolDef.used = true;
                    }
                } else {
                    // Regular symbol usage check
                    if (new RegExp(`\\b${symbolName}\\b`).test(lineText)) {
                        symbolDef.used = true;
                    }
                }
            }
        }
    }

    /**
     * Checks if a symbol is defined in the symbol definitions
     * For parameterized rules, this checks if there's any parameterized rule with the same base name
     * @param symbolName The name of the symbol to check (can include parameters like "rule{param}")
     * @param symbolDefinitions The symbol definitions to search (optional when using symbol table)
     * @param scope Optional scope for context-aware resolution
     * @returns True if the symbol is defined
     */
    public isSymbolDefined(symbolName: string, symbolDefinitions?: Record<string, SymbolDefinition>, scope?: Scope): boolean {
        // If symbol table is available, use scope-aware resolution
        if (this.symbolTable) {
            return this.symbolTable.resolveSymbol(symbolName, scope) !== null;
        }

        // Fallback to legacy implementation
        if (!symbolDefinitions) {
            return false;
        }

        // Direct match
        if (symbolDefinitions.hasOwnProperty(symbolName)) {
            return true;
        }

        // Check if this is a parameterized rule usage
        const paramMatch = symbolName.match(/^([a-z_][a-z_0-9]*)\{.*\}$/);
        if (paramMatch) {
            const baseRuleName = paramMatch[1];

            // Look for any parameterized rule with this base name
            for (const definedSymbolName in symbolDefinitions) {
                const symbolDef = symbolDefinitions[definedSymbolName];
                if (symbolDef.isParameterized && symbolDef.baseRuleName === baseRuleName) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Checks if a base rule name (without parameters) is defined
     * @param baseRuleName The base rule name to check
     * @param symbolDefinitions The symbol definitions to search (optional when using symbol table)
     * @param scope Optional scope for context-aware resolution
     * @returns True if there's a rule (parameterized or not) with this base name
     */
    public isBaseRuleDefined(baseRuleName: string, symbolDefinitions?: Record<string, SymbolDefinition>, scope?: Scope): boolean {
        // If symbol table is available, use scope-aware resolution
        if (this.symbolTable) {
            // Check for exact match first
            if (this.symbolTable.resolveSymbol(baseRuleName, scope)) {
                return true;
            }
            // Check for parameterized rules with this base name
            const parameterizedRule = this.symbolTable.resolveParameterizedRule(baseRuleName, scope);
            return parameterizedRule !== null;
        }

        // Fallback to legacy implementation
        if (!symbolDefinitions) {
            return false;
        }

        // Check for exact match (non-parameterized rule)
        if (symbolDefinitions.hasOwnProperty(baseRuleName)) {
            return true;
        }

        // Check for parameterized rules with this base name
        for (const symbolName in symbolDefinitions) {
            const symbolDef = symbolDefinitions[symbolName];
            if (symbolDef.baseRuleName === baseRuleName) {
                return true;
            }
        }

        return false;
    }

    /**
     * Gets all unused symbols (excluding 'start' which is special)
     * @param symbolDefinitions The symbol definitions to check (optional when using symbol table)
     * @returns Array of symbol names that are unused
     */
    public getUnusedSymbols(symbolDefinitions?: Record<string, SymbolDefinition>): string[] {
        // If symbol table is available, delegate to it
        if (this.symbolTable) {
            return this.symbolTable.getUnusedSymbols();
        }

        // Fallback to legacy implementation
        if (!symbolDefinitions) {
            return [];
        }

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
     * @param symbolDefinitions The symbol definitions to search (optional when using symbol table)
     * @param scope Optional scope for context-aware resolution
     * @returns The line number or -1 if not found
     */
    public getSymbolDefinitionLine(symbolName: string, symbolDefinitions?: Record<string, SymbolDefinition>, scope?: Scope): number {
        // If symbol table is available, use scope-aware resolution
        if (this.symbolTable) {
            const symbol = this.symbolTable.resolveSymbol(symbolName, scope);
            return symbol ? symbol.definition.range.start.line : -1;
        }

        // Fallback to legacy implementation
        if (!symbolDefinitions) {
            return -1;
        }

        const definition = symbolDefinitions[symbolName];
        return definition ? definition.line : -1;
    }

    // ========================================================================
    // NEW SCOPE-AWARE METHODS
    // ========================================================================

    /**
     * Checks if a symbol is defined in a specific scope
     * @param symbolName The name of the symbol to check
     * @param scope The scope to search in
     * @returns True if the symbol is defined in the scope
     */
    public isSymbolDefinedInScope(symbolName: string, scope: Scope): boolean {
        if (!this.symbolTable) {
            return false;
        }
        return this.symbolTable.resolveSymbol(symbolName, scope) !== null;
    }

    /**
     * Resolves a parameter in a specific scope
     * @param paramName The parameter name to resolve
     * @param scope The scope to search in
     * @returns ParameterInfo if found, null otherwise
     */
    public resolveParameterInScope(paramName: string, scope: Scope): ParameterInfo | null {
        if (!this.symbolTable) {
            return null;
        }
        return scope.getParameterInfo ? scope.getParameterInfo(paramName) : null;
    }

    /**
     * Validates parameter arguments for a parameterized rule usage
     * @param ruleName The name of the parameterized rule
     * @param args The arguments provided
     * @param scope The scope context
     * @returns Array of validation results
     */
    public validateParameterArguments(ruleName: string, args: string[], scope: Scope): ValidationResult[] {
        if (!this.symbolTable) {
            return [];
        }
        return this.symbolTable.validateParameterArguments(ruleName, args, scope);
    }

    /**
     * Gets the current scope for a given position in the document
     * @param position The position in the document
     * @returns The scope at that position
     */
    public getCurrentScope(position: vscode.Position): Scope | null {
        if (!this.symbolTable) {
            return null;
        }
        return this.symbolTable.getCurrentScope(position);
    }

    /**
     * Resolves a symbol with full scope context
     * @param symbolName The symbol name to resolve
     * @param scope Optional scope context
     * @returns The resolved symbol entry or null
     */
    public resolveSymbolWithScope(symbolName: string, scope?: Scope): SymbolTableEntry | null {
        if (!this.symbolTable) {
            return null;
        }
        return this.symbolTable.resolveSymbol(symbolName, scope);
    }

    /**
     * Resolves a parameterized rule with scope context
     * @param baseRuleName The base rule name (without parameters)
     * @param scope Optional scope context
     * @returns The resolved parameterized rule entry or null
     */
    public resolveParameterizedRuleWithScope(baseRuleName: string, scope?: Scope): SymbolTableEntry | null {
        if (!this.symbolTable) {
            return null;
        }
        return this.symbolTable.resolveParameterizedRule(baseRuleName, scope);
    }

    /**
     * Marks a symbol as used in a specific scope
     * @param symbolName The symbol name to mark as used
     * @param scope The scope context
     * @param location The location where the symbol is used
     */
    public markSymbolAsUsedInScope(symbolName: string, scope: Scope, location: vscode.Range): void {
        if (!this.symbolTable) {
            return;
        }
        this.symbolTable.markSymbolAsUsed(symbolName, {
            range: location,
            document: vscode.Uri.file('') // This will be set by the caller
        });
    }
}
