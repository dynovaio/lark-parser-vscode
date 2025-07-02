import * as vscode from 'vscode';
import { PARAMETERIZED_RULE_USAGE_REGEX } from '@/utils/LarkRegexPatterns';

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
     * @param symbolDefinitions The symbol definitions to update
     */
    public markUsedSymbols(document: vscode.TextDocument, symbolDefinitions: Record<string, SymbolDefinition>): void {
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
     * @param symbolDefinitions The symbol definitions to search
     * @returns True if the symbol is defined
     */
    public isSymbolDefined(symbolName: string, symbolDefinitions: Record<string, SymbolDefinition>): boolean {
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
     * @param symbolDefinitions The symbol definitions to search
     * @returns True if there's a rule (parameterized or not) with this base name
     */
    public isBaseRuleDefined(baseRuleName: string, symbolDefinitions: Record<string, SymbolDefinition>): boolean {
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
