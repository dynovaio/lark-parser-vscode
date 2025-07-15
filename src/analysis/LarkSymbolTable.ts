import * as vscode from 'vscode';
import { LarkScope } from './LarkScope';
import type {
    Scope,
    SymbolTable,
    SymbolTableEntry,
    SymbolLocation,
    ParameterInfo
} from './types.d';

export enum SymbolTypes {
    TERMINAL = 'terminal',
    RULE = 'rule',
    UNKNOWN = 'unknown'
}

export enum SymbolModifiers {
    CONDITIONAL_INLINE = '?',
    PIN = '!'
}

/**
 * Central symbol table for Lark grammar analysis
 * Manages symbols, scopes, and provides symbol resolution services
 */
export class LarkSymbolTable implements SymbolTable {
    private globalScope: LarkScope;
    private scopes: Map<string, LarkScope>; // Rule name -> scope

    constructor() {
        this.globalScope = new LarkScope('global', new vscode.Range(0, 0, 0, 0));
        this.scopes = new Map();
    }

    /**
     * Resolves a symbol by name in the given scope
     * @param name Symbol name to resolve
     * @param scope Scope to search in (defaults to global scope)
     * @returns SymbolTableEntry if found, null otherwise
     */
    resolveSymbol(name: string, scope?: Scope): SymbolTableEntry | null {
        const searchScope = scope || this.globalScope;
        return searchScope.resolveSymbol(name);
    }

    /**
     * Resolves a template rule by base name
     * @param name Base rule name (without parameters)
     * @param scope Scope to search in (defaults to global scope)
     * @returns SymbolTableEntry if found, null otherwise
     */
    resolveTemplateRule(name: string, scope?: Scope): SymbolTableEntry | null {
        const searchScope = scope || this.globalScope;

        // First check for exact match
        const exactMatch = searchScope.resolveSymbol(name);
        if (exactMatch) {
            return exactMatch;
        }

        // Look for template rules with this base name
        return this.findTemplateRuleByBaseName(name, searchScope);
    }

    /**
     * Gets the scope at a specific position in the document
     * @param position Position in the document
     * @returns Scope containing the position
     */
    getCurrentScope(position: vscode.Position): Scope {
        // Check rule scopes first (most specific)
        for (const scope of this.scopes.values()) {
            if (scope.containsPosition(position)) {
                return scope;
            }
        }

        // Default to global scope
        return this.globalScope;
    }

    /**
     * Gets the global scope
     * @returns Global scope
     */
    getGlobalScope(): Scope {
        return this.globalScope;
    }

    /**
     * Gets a rule scope by name
     * @param ruleName Name of the rule
     * @returns Rule scope if found, null otherwise
     */
    getRuleScope(ruleName: string): Scope | null {
        return this.scopes.get(ruleName) || null;
    }

    /**
     * Gets document symbols for VS Code outline
     * @returns Array of DocumentSymbol objects
     */
    getDocumentSymbols(): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = [];

        // Convert symbol table entries to DocumentSymbols
        for (const entry of this.globalScope.getLocalSymbols()) {
            symbols.push(this.convertToDocumentSymbol(entry));
        }

        return symbols;
    }

    /**
     * Gets all unused symbols
     * @returns Array of unused symbol names
     */
    getUnusedSymbols(): string[] {
        const unusedSymbols: string[] = [];

        // Check global scope
        for (const entry of this.globalScope.getLocalSymbols()) {
            if (!entry.isUsed && entry.name !== 'start') {
                unusedSymbols.push(entry.name);
            }
        }

        return unusedSymbols;
    }

    /**
     * Validates parameter arguments for a template rule usage
     * @param ruleName Base rule name
     * @param args Arguments provided
     * @param scope Scope for argument validation
     * @returns Array of validation results
     */
    // validateParameterArguments(ruleName: string, args: string[], scope: Scope): ValidationResult[] {
    //     // TODO: Implement parameter argument validation
    //     // For now, return empty array (no errors)
    //     return [];
    // }

    /**
     * Marks a symbol as used and tracks the usage location
     * @param symbolName Name of the symbol
     * @param locationOrScope Location where the symbol was used, or scope for backward compatibility
     * @param scope Optional scope context for resolution (when first param is location)
     */
    markSymbolAsUsed(symbolName: string, location: SymbolLocation, scope?: Scope): void {
        const resolveScope = scope || this.globalScope;
        const entry = this.resolveSymbol(symbolName, resolveScope);

        if (entry) {
            entry.isUsed = true;
            if (!entry.usages) {
                entry.usages = [];
            }
            entry.usages.push(location);
        }
    }

    markSymbolAsIgnored(symbolName: string, location: SymbolLocation, scope?: Scope): void {
        const resolveScope = scope || this.globalScope;
        const entry = this.resolveSymbol(symbolName, resolveScope);
        if (entry) {
            entry.isIgnored = true;
            if (!entry.ignoreLocations) {
                entry.ignoreLocations = [];
            }
            entry.ignoreLocations.push(location);
        }
    }

    /**
     * Adds a symbol to the specified scope
     * @param entry Symbol table entry to add
     * @param scope Scope to add the symbol to (defaults to global)
     */
    addSymbol(entry: SymbolTableEntry, scope?: Scope): void {
        const targetScope = scope || this.globalScope;
        targetScope.addSymbol(entry);
    }

    /**
     * Creates a new rule scope
     * @param ruleName Name of the rule
     * @param range Range of the rule definition
     * @param parameters Parameters of the rule (if template)
     * @returns Created rule scope
     */
    createRuleScope(
        ruleName: string,
        range: vscode.Range,
        parameters?: ParameterInfo[]
    ): LarkScope {
        const ruleScope = new LarkScope('rule', range, ruleName, this.globalScope);

        // Add parameters to the scope
        if (parameters) {
            for (const param of parameters) {
                ruleScope.addParameter(param);
            }
        }

        this.scopes.set(ruleName, ruleScope);
        return ruleScope;
    }

    /**
     * Clears all symbols and scopes
     */
    // private clearSymbolTable(): void {
    //     this.globalScope = new LarkScope('global', new vscode.Range(0, 0, 0, 0));
    //     this.scopes.clear();
    // }

    /**
     * Gets all symbols from all scopes
     * @returns Array of all symbol table entries
     */
    getAllSymbols(): SymbolTableEntry[] {
        const allSymbols: SymbolTableEntry[] = [];

        // Get symbols from global scope
        allSymbols.push(...this.globalScope.getLocalSymbols());

        // Get symbols from all rule scopes
        for (const scope of this.scopes.values()) {
            allSymbols.push(...scope.getLocalSymbols());
        }

        return allSymbols;
    }

    /**
     * Finds a template rule by its base name
     * @param baseName Base name to search for
     * @param scope Scope to search in
     * @returns SymbolTableEntry if found, null otherwise
     */
    private findTemplateRuleByBaseName(baseName: string, scope: Scope): SymbolTableEntry | null {
        // Search in current scope
        for (const entry of scope.symbols.values()) {
            if (entry.baseRuleName === baseName) {
                return entry;
            }
        }

        // Search in parent scope
        if (scope.parent) {
            return this.findTemplateRuleByBaseName(baseName, scope.parent);
        }

        return null;
    }

    /**
     * Converts a SymbolTableEntry to a DocumentSymbol
     * @param entry Symbol table entry to convert
     * @returns DocumentSymbol object
     */
    private convertToDocumentSymbol(entry: SymbolTableEntry): vscode.DocumentSymbol {
        let symbolKind = vscode.SymbolKind.Constant;

        if (entry.type === SymbolTypes.RULE) {
            symbolKind = vscode.SymbolKind.Method;

            if (entry.isTemplate) {
                symbolKind = vscode.SymbolKind.Class;
            }
        }

        let detail = 'Terminal';

        if (entry.type === SymbolTypes.RULE) {
            detail = 'Rule';

            if (entry.isTemplate) {
                detail = 'Template Rule';
            }
        }

        if (entry.isImported) {
            detail = `Imported ${detail}`;
        }

        if (entry.isAlias) {
            detail = `${detail} (alias)`;
        }

        return new vscode.DocumentSymbol(
            entry.name,
            detail,
            symbolKind,
            entry.location.range,
            entry.location.range
        );
    }

    /**
     * Clear all symbols in a specific scope
     */
    clearScope(scope: LarkScope): void {
        scope.symbols.clear();
        if (scope.parameters) {
            scope.parameters.clear();
        }
    }

    /**
     * Get all scopes in the symbol table
     */
    getAllScopes(): LarkScope[] {
        const allScopes = [this.globalScope];
        for (const scope of this.scopes.values()) {
            allScopes.push(scope);
        }
        return allScopes;
    }

    /**
     * Get scopes that contain the given range
     */
    getScopesContaining(range: vscode.Range): LarkScope[] {
        const containingScopes: LarkScope[] = [];

        // Check global scope
        if (this.rangeContains(this.globalScope.range, range)) {
            containingScopes.push(this.globalScope);
        }

        // Check rule scopes
        for (const scope of this.scopes.values()) {
            if (this.rangeContains(scope.range, range)) {
                containingScopes.push(scope);
            }
        }

        return containingScopes;
    }

    /**
     * Check if one range contains another
     */
    private rangeContains(container: vscode.Range, contained: vscode.Range): boolean {
        return (
            container.start.line <= contained.start.line &&
            container.end.line >= contained.end.line &&
            (container.start.line < contained.start.line ||
                container.start.character <= contained.start.character) &&
            (container.end.line > contained.end.line ||
                container.end.character >= contained.end.character)
        );
    }
}
