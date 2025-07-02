import * as vscode from 'vscode';

// ============================================================================
// CORE TYPE DEFINITIONS
// ============================================================================

/**
 * Types of symbols in a Lark grammar
 */
export type SymbolType = 'terminal' | 'rule' | 'parameter' | 'imported';

/**
 * Types of scopes in Lark grammar analysis
 */
export type ScopeType = 'global' | 'rule' | 'directive';

// ============================================================================
// SCOPE-RELATED INTERFACES
// ============================================================================

/**
 * Information about a parameter in a parameterized rule
 */
export interface ParameterInfo {
    name: string;
    position: number; // Position in parameter list (0-based)
    range: vscode.Range; // Location in document
}

/**
 * Location information for a symbol
 */
export interface SymbolLocation {
    range: vscode.Range;
    document: vscode.Uri;
}

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
 * Entry in the symbol table
 * Central interface representing any symbol in a Lark grammar
 */
export interface SymbolTableEntry {
    name: string;
    type: SymbolType;
    definition: SymbolLocation;
    usages: SymbolLocation[];
    scope: Scope;
    isUsed: boolean;

    // For parameterized rules
    isParameterized?: boolean;
    baseRuleName?: string; // For parameterized rules, the base name without parameters
    parameters?: ParameterInfo[]; // Parameters defined by this rule

    // For imported symbols
    importSource?: string; // Module name for imported symbols
    originalName?: string; // Original name before alias

    // For declared terminals (using %declare directive)
    isDeclared?: boolean; // True if terminal was declared with %declare vs defined with :
}

// ============================================================================
// VALIDATION AND ANALYSIS INTERFACES
// ============================================================================

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
 * Information about a parameterized rule usage
 */
export interface ParameterizedRuleUsage {
    ruleName: string;
    arguments: string[];
    range: vscode.Range;
    argumentRanges: vscode.Range[]; // Individual argument ranges
}

/**
 * Result of parsing a parameterized rule definition
 */
export interface ParameterizedRuleDefinition {
    ruleName: string;
    parameters: ParameterInfo[];
    range: vscode.Range;
    bodyRange: vscode.Range; // Range of the rule body (after ':')
}
