import * as vscode from 'vscode';
import { LarkScope } from './LarkScope';
import type {
    Scope,
    SymbolTableEntry,
    SymbolType,
    SymbolLocation,
    ParameterizedRuleUsage,
    ValidationResult,
    ParameterInfo
} from './types.d';

// Forward declaration to avoid circular dependency
interface DocumentAnalyzer {
    analyzeDocument(document: vscode.TextDocument): Promise<void>;
}
import type { SymbolDefinition } from '../features/SymbolResolver';

/**
 * Central symbol table for Lark grammar analysis
 * Manages symbols, scopes, and provides symbol resolution services
 */
export class LarkSymbolTable {
    private globalScope: LarkScope;
    private scopes: Map<string, LarkScope>; // Rule name -> scope
    private documentUri: vscode.Uri | null = null;
    private documentVersion: number = -1;
    private analyzer: DocumentAnalyzer | null = null;

    constructor () {
        this.globalScope = new LarkScope('global', new vscode.Range(0, 0, 0, 0));
        this.scopes = new Map();
    }

    /**
     * Sets the document analyzer for this symbol table
     * @param analyzer The LarkDocumentAnalyzer instance
     */
    setAnalyzer(analyzer: DocumentAnalyzer): void {
        this.analyzer = analyzer;
    }

    /**
     * Updates the symbol table from a document
     * @param document The document to analyze
     */
    async updateFromDocument(document: vscode.TextDocument): Promise<void> {
        // Check if document has changed
        if (this.documentUri?.toString() === document.uri.toString() &&
            this.documentVersion === document.version) {
            return; // No changes needed
        }

        this.documentUri = document.uri;
        this.documentVersion = document.version;

        // Clear existing data
        this.clearSymbolTable();

        // Use analyzer if available, otherwise create basic global scope
        if (this.analyzer) {
            await this.analyzer.analyzeDocument(document);
        } else {
            // Fallback: create a basic global scope
            this.globalScope = new LarkScope(
                'global',
                new vscode.Range(0, 0, document.lineCount - 1, 0)
            );
        }
    }

    /**
     * Updates the symbol table from a text change event (incremental update)
     * @param change The text change event
     */
    updateFromTextChange(change: vscode.TextDocumentChangeEvent): void {
        // TODO: Implement incremental updates
        // For now, mark for full rebuild
        this.documentVersion = -1;
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
     * Resolves a parameterized rule by base name
     * @param name Base rule name (without parameters)
     * @param scope Scope to search in (defaults to global scope)
     * @returns SymbolTableEntry if found, null otherwise
     */
    resolveParameterizedRule(name: string, scope?: Scope): SymbolTableEntry | null {
        const searchScope = scope || this.globalScope;

        // First check for exact match
        const exactMatch = searchScope.resolveSymbol(name);
        if (exactMatch) {
            return exactMatch;
        }

        // Look for parameterized rules with this base name
        return this.findParameterizedRuleByBaseName(name, searchScope);
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
     * Gets symbol definitions in the format expected by SymbolResolver
     * @returns Record mapping symbol names to their definitions
     */
    getSymbolDefinitions(): Record<string, SymbolDefinition> {
        const definitions: Record<string, SymbolDefinition> = {};

        // Collect symbols from all scopes
        this.collectSymbolDefinitions(this.globalScope, definitions);
        for (const scope of this.scopes.values()) {
            this.collectSymbolDefinitions(scope, definitions);
        }

        return definitions;
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
     * Validates parameter arguments for a parameterized rule usage
     * @param ruleName Base rule name
     * @param args Arguments provided
     * @param scope Scope for argument validation
     * @returns Array of validation results
     */
    validateParameterArguments(ruleName: string, args: string[], scope: Scope): ValidationResult[] {
        // TODO: Implement parameter argument validation
        // For now, return empty array (no errors)
        return [];
    }

    /**
     * Marks a symbol as used and tracks the usage location
     * @param symbolName Name of the symbol
     * @param locationOrScope Location where the symbol was used, or scope for backward compatibility
     * @param scope Optional scope context for resolution (when first param is location)
     */
    markSymbolAsUsed(symbolName: string, locationOrScope: SymbolLocation | Scope, scope?: Scope): void {
        let resolveScope: Scope;
        let location: SymbolLocation | undefined;

        // Handle backward compatibility - if second parameter is a Scope
        if ('type' in locationOrScope && locationOrScope.type) {
            resolveScope = locationOrScope as Scope;
            // No location tracking for backward compatibility calls
        } else {
            location = locationOrScope as SymbolLocation;
            resolveScope = scope || this.globalScope;
        }

        const entry = this.resolveSymbol(symbolName, resolveScope);
        if (entry) {
            entry.isUsed = true;
            if (location) {
                entry.usages.push(location);
            }
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
     * @param parameters Parameters of the rule (if parameterized)
     * @returns Created rule scope
     */
    createRuleScope(ruleName: string, range: vscode.Range, parameters?: ParameterInfo[]): LarkScope {
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
     * Sets the document context for this symbol table
     * @param documentUri The document URI
     * @param documentVersion The document version
     */
    setDocumentContext(documentUri: vscode.Uri, documentVersion: number): void {
        this.documentUri = documentUri;
        this.documentVersion = documentVersion;
    }

    /**
     * Clears all symbols and scopes
     */
    private clearSymbolTable(): void {
        this.globalScope = new LarkScope('global', new vscode.Range(0, 0, 0, 0));
        this.scopes.clear();
    }

    /**
     * Clears all symbols for a specific document
     * @param documentUri URI of the document to clear
     */
    clearDocument(documentUri: vscode.Uri): void {
        if (this.documentUri?.toString() === documentUri.toString()) {
            this.clearSymbolTable();
            // Note: Don't set documentUri to null here, as we might be clearing
            // in preparation for repopulating the same document
            this.documentVersion = -1;
        }
    }

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
     * Finds a parameterized rule by its base name
     * @param baseName Base name to search for
     * @param scope Scope to search in
     * @returns SymbolTableEntry if found, null otherwise
     */
    private findParameterizedRuleByBaseName(baseName: string, scope: Scope): SymbolTableEntry | null {
        // Search in current scope
        for (const entry of scope.symbols.values()) {
            if (entry.baseRuleName === baseName) {
                return entry;
            }
        }

        // Search in parent scope
        if (scope.parent) {
            return this.findParameterizedRuleByBaseName(baseName, scope.parent);
        }

        return null;
    }

    /**
     * Collects symbol definitions from a scope
     * @param scope Scope to collect from
     * @param definitions Target definitions record
     */
    private collectSymbolDefinitions(scope: Scope, definitions: Record<string, SymbolDefinition>): void {
        for (const entry of scope.symbols.values()) {
            definitions[entry.name] = {
                line: entry.definition.range.start.line,
                used: entry.isUsed,
                isParameterized: entry.isParameterized,
                baseRuleName: entry.baseRuleName
            };
        }
    }

    /**
     * Converts a SymbolTableEntry to a DocumentSymbol
     * @param entry Symbol table entry to convert
     * @returns DocumentSymbol object
     */
    private convertToDocumentSymbol(entry: SymbolTableEntry): vscode.DocumentSymbol {
        const symbolKind = entry.type === 'terminal' ? vscode.SymbolKind.Constant : vscode.SymbolKind.Function;
        const detail = entry.type === 'rule' ? 'rule' : 'terminal';

        return new vscode.DocumentSymbol(
            entry.name,
            detail,
            symbolKind,
            entry.definition.range,
            entry.definition.range
        );
    }
}
