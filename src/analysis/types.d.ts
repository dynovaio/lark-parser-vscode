import * as vscode from 'vscode';

// ============================================================================
// SCOPE-RELATED INTERFACES
// ============================================================================

/**
 * Types of scopes in Lark grammar analysis
 */
export type ScopeType = 'global' | 'rule';

/**
 * Represents a scope context for symbol resolution
 * Used by both LarkScope and LarkSymbolTable implementations
 */
export interface Scope {
    type: ScopeType;
    name?: string; // Rule name for rule scopes
    parent?: Scope;
    range: vscode.Range;

    // Symbol storage
    symbols: Map<string, SymbolTableEntry>;
    parameters?: Map<string, ParameterInfo>; // Available parameters in this scope

    // Scope operations
    resolveSymbol(name: string): SymbolTableEntry | null;
    addSymbol(entry: SymbolTableEntry): void;
    isParameterDefined(name: string): boolean;
    getParameterInfo(name: string): ParameterInfo | null;
}

// ============================================================================
// SYMBOL TABLE INTERFACES
// ============================================================================

/**
 * Types of symbols in a Lark grammar
 */
export type SymbolType = 'terminal' | 'rule' | 'unknown';

export type SymbolModifier = '?' | '!';

/**
 * Symbol definition in file
 */
export interface SymbolDefinition {
    lines: string[]; // Symbol name
    body: string; // Definition body (for rules, terminals, etc.)
    startIndex: number; // Location in document
    endIndex: number; // Location in document overrides a previous definition
}

/**
 * Location information for a symbol
 */
export interface SymbolLocation {
    range: vscode.Range;
    uri: vscode.Uri;
}

/**
 * Information about a parameter in a template rule
 */
export interface ParameterInfo {
    name: string;
    position: number; // Position in parameter list (0-based)
    range: vscode.Range; // Location in document
}

/**
 * Entry in the symbol table
 * Central interface representing any symbol in a Lark grammar
 */
export interface SymbolTableEntry {
    // Basic symbol information
    name: string;
    priority?: number;
    body?: string;
    isDefined?: boolean;

    // Symbol metadata
    type: SymbolType;
    scope: Scope;
    location: SymbolLocation;

    // For template rules
    isTemplate?: boolean;
    baseRuleName?: string;
    parameters?: ParameterInfo[];

    // For parameters inside rules
    isParameter?: boolean;
    parameterInfo?: ParameterInfo;
    parameterPosition?: number; // Position in the parameter list (0-based)
    parentRuleName?: string; // If this is a parameter, the rule it belongs to

    // Usage tracking
    usages: SymbolLocation[];
    isUsed: boolean;

    // Modifiers
    isInlined?: boolean;
    isConditionallyInlined?: boolean;
    isPinned?: boolean;

    // Directive related metadata
    isIgnored?: boolean;
    ignoreLocations?: SymbolLocation[];

    isDeclared?: boolean;

    isOverridden?: boolean;
    overrideLocations?: SymbolLocation[];

    isExtended?: boolean;
    textensionLocations?: SymbolLocation[];

    isImported?: boolean;
    importSource?: string;
    importName?: string;

    // For aliases rules
    isAlias?: boolean;
    originalName?: string;
    originalType?: string;

    // Detected known errors
    hasSyntaxError?: boolean;
    syntaxError?: SyntaxError;
}

export interface SymbolTable {
    // private globalScope: Scope;
    // private scopes: Map<string, Scope>;

    resolveSymbol(name: string, scope?: Scope): SymbolTableEntry | null;
    resolveTemplateRule(name: string, scope?: Scope): SymbolTableEntry | null;
    getCurrentScope(position: vscode.Position): Scope;
    getGlobalScope(): Scope;
    getRuleScope(ruleName: string): Scope | null;
    getDocumentSymbols(): vscode.DocumentSymbol[];
    getUnusedSymbols(): string[];
    // validateParameterArguments(ruleName: string, arguments: string[], scope?: Scope): ValidationResult[];
    markSymbolAsUsed(symbolName: string, location: SymbolLocation, scope?: Scope): void;
    markSymbolAsIgnored(symbolName: string, location: SymbolLocation, scope?: Scope): void;
    addSymbol(entry: SymbolTableEntry, scope?: Scope): void;
    createRuleScope(ruleName: string, range: vscode.Range, parameters?: ParameterInfo[]): Scope;
    getAllSymbols(): SymbolTableEntry[];
    // private findTemplateRuleByBaseName(baseName: string, scope: Scope): SymbolTableEntry | null;
    // private convertToDocumentSymbol(entry: SymbolTableEntry): vscode.DocumentSymbol;
    clearScope(scope: Scope): void;
    getAllScopes(): Scope[];
    getScopesContaining(range: vscode.Range): Scope[];
    // private rangeContains(container: vscode.Range, contained: vscode.Range): boolean;
}

export type UndefinedSymbolTable = Map<string, SymbolTableEntry>;

export interface SyntaxError {
    message: string;
    range: vscode.Range;
}

// ============================================================================
// VALIDATION AND ANALYSIS INTERFACES
// ============================================================================

/**
 * Analysis result for a Lark document
 */
export interface AnalysisResult {
    symbolTable: SymbolTable;
    undefinedSymbolTable: UndefinedSymbolTable;
    syntaxErrors: SyntaxError[];
}

/**
 * Validation result for parameter arguments
 */
export interface ValidationResult {
    isValid: boolean;
    errorMessage?: string;
    errorRange?: vscode.Range;
}

// ============================================================================
// PARSING AND USAGE TRACKING INTERFACES
// ============================================================================

/**
 * Information about a template rule usage
 */
export interface TemplateRuleUsage {
    ruleName: string;
    arguments: string[];
    range: vscode.Range;
    argumentRanges: vscode.Range[]; // Individual argument ranges
}

/**
 * Result of parsing a template rule definition
 */
export interface TemplateRuleDefinition {
    ruleName: string;
    parameters: ParameterInfo[];
    range: vscode.Range;
    bodyRange: vscode.Range; // Range of the rule body (after ':')
}
