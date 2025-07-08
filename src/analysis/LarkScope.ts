import * as vscode from 'vscode';
import type { Scope, ScopeType, SymbolTableEntry, ParameterInfo } from './types.d';

export enum ScopeTypes {
    GLOBAL = 'global',
    RULE = 'rule'
}

/**
 * Basic implementation of a scope for symbol resolution
 */
export class LarkScope implements Scope {
    public symbols: Map<string, SymbolTableEntry>;
    public parameters?: Map<string, ParameterInfo>;
    public needsRebuild: boolean = false; // For incremental updates

    constructor(
        public type: ScopeType,
        public range: vscode.Range,
        public name?: string,
        public parent?: Scope
    ) {
        this.symbols = new Map();
        if (type === 'rule') {
            this.parameters = new Map();
        }
    }

    /**
     * Resolves a symbol by name, checking this scope and parent scopes
     * @param name Symbol name to resolve
     * @returns SymbolTableEntry if found, null otherwise
     */
    resolveSymbol(name: string): SymbolTableEntry | null {
        // Check local symbols first
        const localSymbol = this.symbols.get(name);
        if (localSymbol) {
            return localSymbol;
        }

        // Check parent scope
        if (this.parent) {
            return this.parent.resolveSymbol(name);
        }

        return null;
    }

    /**
     * Adds a symbol to this scope
     * @param entry Symbol table entry to add
     */
    addSymbol(entry: SymbolTableEntry): void {
        this.symbols.set(entry.name, entry);
        entry.scope = this;
    }

    /**
     * Checks if a parameter is defined in this scope
     * @param name Parameter name to check
     * @returns True if parameter is defined in this scope
     */
    isParameterDefined(name: string): boolean {
        return this.parameters?.has(name) ?? false;
    }

    /**
     * Gets parameter information
     * @param name Parameter name
     * @returns ParameterInfo if found, null otherwise
     */
    getParameterInfo(name: string): ParameterInfo | null {
        return this.parameters?.get(name) ?? null;
    }

    /**
     * Adds a parameter to this scope (only valid for rule scopes)
     * @param paramInfo Parameter information to add
     */
    addParameter(paramInfo: ParameterInfo): void {
        if (this.type !== 'rule') {
            throw new Error('Parameters can only be added to rule scopes');
        }

        if (!this.parameters) {
            this.parameters = new Map();
        }

        this.parameters.set(paramInfo.name, paramInfo);
    }

    /**
     * Gets all symbols defined in this scope (not including parent scopes)
     * @returns Array of symbol table entries
     */
    getLocalSymbols(): SymbolTableEntry[] {
        return Array.from(this.symbols.values());
    }

    /**
     * Gets all parameters defined in this scope
     * @returns Array of parameter information
     */
    getParameters(): ParameterInfo[] {
        return this.parameters ? Array.from(this.parameters.values()) : [];
    }

    /**
     * Checks if this scope contains a given position
     * @param position Position to check
     * @returns True if position is within this scope's range
     */
    containsPosition(position: vscode.Position): boolean {
        return this.range.contains(position);
    }

    /**
     * Creates a string representation for debugging
     * @returns String representation of the scope
     */
    toString(): string {
        const symbolCount = this.symbols.size;
        const paramCount = this.parameters?.size ?? 0;
        return `${this.type}Scope(${this.name || 'unnamed'}, symbols: ${symbolCount}, params: ${paramCount})`;
    }
}
