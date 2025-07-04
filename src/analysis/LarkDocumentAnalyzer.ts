import * as vscode from 'vscode';
import { LarkSymbolTable } from './LarkSymbolTable';
import type { SymbolTableEntry, SymbolType, ParameterInfo, SymbolLocation } from './types.d';
import { LarkScope } from './LarkScope';

/**
 * Analyzes Lark grammar documents and populates the symbol table
 */
export class LarkDocumentAnalyzer {
    private symbolTable: LarkSymbolTable;

    // Enhanced regex patterns for better parsing
    private static readonly PATTERNS = {
        // Rule definitions: rule_name: expression (can start with underscore)
        RULE_DEFINITION: /^\s*[?!]?([a-z_][a-z0-9_]*)\s*:\s*(.+)/,

        // Terminal definitions: TERMINAL_NAME: expression (can start with underscore)
        TERMINAL_DEFINITION: /^([A-Z_][A-Z0-9_]*)\s*:\s*(.+)/,

        // Parameterized rules: rule_name{param1, param2}: expression (can start with underscore)
        PARAMETERIZED_RULE: /^([a-z_][a-z0-9_]*)\s*\{\s*([^}]+)\}\s*:\s*(.+)/,

        // Import statements support five Lark formats:
        // 1. %import module.TERMINAL
        // 2. %import module.rule
        // 3. %import module.TERMINAL -> NEWTERMINAL
        // 4. %import module.rule -> newrule
        // 5. %import module (TERM1, TERM2, rule1, rule2)
        IMPORT_STATEMENT_SINGLE: /^%import\s+([a-z0-9_.]+)\.([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:->\s*([a-zA-Z_][a-zA-Z0-9_]*))?\s*$/,
        IMPORT_STATEMENT_MULTI: /^%import\s+([a-z0-9_.]+)\s*\(\s*([^)]+)\s*\)\s*$/,

        // Declare directive: %declare TERMINAL1 TERMINAL2 ...
        DECLARE_DIRECTIVE: /^%declare\s+(.+)$/,

        // Symbol references in rule bodies (can start with underscore)
        SYMBOL_REFERENCE: /\b([a-z_][a-z0-9_]*|[A-Z_][A-Z0-9_]*)\b/g,

        // Parameterized rule calls: rule_name{arg1, arg2} (can start with underscore)
        PARAMETERIZED_CALL: /([a-z_][a-z0-9_]*)\s*\{\s*([^}]+)\}/g,

        // Comments (Lark only supports single-line comments)
        COMMENT: /\/\/.*$/,

        // Directives (only allowed: %ignore, %import, %declare, %override, %extend)
        DIRECTIVE: /^%(ignore|import|declare|override|extend)\b.*$/
    };

    constructor (symbolTable: LarkSymbolTable) {
        this.symbolTable = symbolTable;
    }

    /**
     * Analyzes a Lark document and populates the symbol table
     * @param document The document to analyze
     * @returns Promise that resolves when analysis is complete
     */
    public async analyzeDocument(document: vscode.TextDocument): Promise<void> {
        // Set document context in symbol table (needed for clearDocument to work)
        this.symbolTable.setDocumentContext(document.uri, document.version);

        // Clear existing symbols for this document
        this.symbolTable.clearDocument(document.uri);

        const text = document.getText();
        const lines = text.split('\n');

        // Follow planned architecture structure
        await this.parseGlobalDirectives(document, lines);
        await this.parseSymbolDefinitions(document, lines);
        await this.buildScopeHierarchy(document, lines);

        // Second pass: collect symbol references and validate
        await this.collectReferences(document, lines);
    }

    /**
     * First phase: Parse global directives (imports, declares, ignores)
     */
    private async parseGlobalDirectives(document: vscode.TextDocument, lines: string[]): Promise<void> {
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex].trim();

            // Skip empty lines and comments
            if (!line || this.isComment(line)) {
                continue;
            }

            // Handle multi-line directives
            const fullDefinition = this.collectMultiLineDefinition(lines, lineIndex);
            const definitionText = fullDefinition.lines.join(' ').trim();

            // Process only directives in this phase
            if (this.parseImportDirective(document, definitionText, lineIndex) ||
                this.parseDeclareDirective(document, definitionText, lineIndex) ||
                this.parseIgnoreDirective(document, definitionText, lineIndex)) {
                // Skip the lines we've already processed
                lineIndex = fullDefinition.endLine;
            }
        }
    }

    /**
     * Second phase: Parse symbol definitions (terminals, rules, parameterized rules)
     */
    private async parseSymbolDefinitions(document: vscode.TextDocument, lines: string[]): Promise<void> {
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex].trim();

            // Skip empty lines and comments
            if (!line || this.isComment(line)) {
                continue;
            }

            // Handle multi-line definitions
            const fullDefinition = this.collectMultiLineDefinition(lines, lineIndex);
            const definitionText = fullDefinition.lines.join(' ').trim();

            // Process only symbol definitions in this phase
            if (this.parseParameterizedRuleDefinition(document, definitionText, lineIndex, fullDefinition.endLine) ||
                this.parseRuleDefinition(document, definitionText, lineIndex, fullDefinition.endLine) ||
                this.parseTerminalDefinition(document, definitionText, lineIndex, fullDefinition.endLine)) {
                // Skip the lines we've already processed
                lineIndex = fullDefinition.endLine;
            }
        }
    }

    /**
     * Third phase: Build scope hierarchy and link scope chains
     */
    private async buildScopeHierarchy(document: vscode.TextDocument, lines: string[]): Promise<void> {
        // Create global scope (already handled by clearDocument, but ensure it's proper)
        this.createGlobalScope(document);

        // Create rule scopes for parameterized rules
        await this.createRuleScopes(document);

        // Link scope chain (establish parent-child relationships)
        this.linkScopeChain();
    }

    /**
     * Collects multi-line rule definitions
     */
    private collectMultiLineDefinition(lines: string[], startIndex: number): { lines: string[], endLine: number } {
        const collectedLines: string[] = [lines[startIndex]];
        let currentIndex = startIndex;

        // If the first line contains a colon, it's a rule definition
        const firstLine = lines[startIndex].trim();
        if (!firstLine.includes(':')) {
            return { lines: collectedLines, endLine: currentIndex };
        }

        // Continue collecting lines until we find the end of the definition
        while (currentIndex < lines.length - 1) {
            const nextLine = lines[currentIndex + 1].trim();

            // Stop if next line is empty, a comment, or starts a new definition
            if (!nextLine ||
                this.isComment(nextLine) ||
                this.isNewDefinition(nextLine)) {
                break;
            }

            currentIndex++;
            collectedLines.push(lines[currentIndex]);
        }

        return { lines: collectedLines, endLine: currentIndex };
    }

    /**
     * Checks if a line starts a new definition
     */
    private isNewDefinition(line: string): boolean {
        return line.match(/^[a-zA-Z][a-zA-Z0-9_]*\s*[:({]/) !== null ||
            line.startsWith('%');
    }

    /**
     * Checks if a line is a continuation line (doesn't end with complete definition)
     */
    private isContinuationLine(line: string): boolean {
        // Simple heuristic: if line doesn't contain : or ends with |, it might be a continuation
        return !line.includes(':') || line.endsWith('|') || line.endsWith('?') || line.endsWith('*') || line.endsWith('+');
    }

    /**
     * Checks if a line is an alternative line (starts with |)
     */
    private isAlternativeLine(line: string): boolean {
        return line.startsWith('|');
    }

    /**
     * Processes a single definition (rule, terminal, or import)
     */
    private async processDefinition(document: vscode.TextDocument, definitionText: string, startLine: number, endLine: number): Promise<void> {
        // Remove comments from definition
        const cleanDefinition = this.removeComments(definitionText);

        // Try to match different types of definitions
        if (this.tryProcessImport(document, cleanDefinition, startLine)) {
            return;
        }

        if (this.tryProcessDeclare(document, cleanDefinition, startLine)) {
            return;
        }

        if (this.tryProcessParameterizedRule(document, cleanDefinition, startLine, endLine)) {
            return;
        }

        if (this.tryProcessRule(document, cleanDefinition, startLine, endLine)) {
            return;
        }

        if (this.tryProcessTerminal(document, cleanDefinition, startLine, endLine)) {
            return;
        }

        // If we can't identify the definition type, it might be a directive or other construct
        this.tryProcessDirective(document, cleanDefinition, startLine);
    }

    /**
     * Tries to process an import statement
     */
    private tryProcessImport(document: vscode.TextDocument, definition: string, lineIndex: number): boolean {
        // Try single symbol import first
        let match = definition.match(LarkDocumentAnalyzer.PATTERNS.IMPORT_STATEMENT_SINGLE);
        if (match) {
            const [, moduleName, symbolName, alias] = match;
            const finalName = alias || symbolName;

            const range = new vscode.Range(lineIndex, 0, lineIndex, definition.length);
            const location: SymbolLocation = {
                range,
                document: document.uri
            };

            const entry: SymbolTableEntry = {
                name: finalName,
                type: 'imported',
                definition: location,
                usages: [],
                scope: this.symbolTable.getGlobalScope(),
                isUsed: false,
                importSource: moduleName,
                originalName: symbolName
            };

            this.symbolTable.addSymbol(entry);
            return true;
        }

        // Try multi-symbol import
        match = definition.match(LarkDocumentAnalyzer.PATTERNS.IMPORT_STATEMENT_MULTI);
        if (match) {
            const [, moduleName, symbolsStr] = match;
            const symbols = this.parseMultiImportSymbols(symbolsStr);

            const range = new vscode.Range(lineIndex, 0, lineIndex, definition.length);
            const location: SymbolLocation = {
                range,
                document: document.uri
            };

            // Add each imported symbol to the symbol table
            for (const symbol of symbols) {
                const entry: SymbolTableEntry = {
                    name: symbol.alias || symbol.name,
                    type: 'imported',
                    definition: location,
                    usages: [],
                    scope: this.symbolTable.getGlobalScope(),
                    isUsed: false,
                    importSource: moduleName,
                    originalName: symbol.name
                };

                this.symbolTable.addSymbol(entry);
            }
            return true;
        }

        return false;
    }

    /**
     * Tries to process a declare directive
     */
    private tryProcessDeclare(document: vscode.TextDocument, definition: string, lineIndex: number): boolean {
        const match = definition.match(LarkDocumentAnalyzer.PATTERNS.DECLARE_DIRECTIVE);
        if (!match) {
            return false;
        }

        const [, terminalsStr] = match;
        const terminalNames = terminalsStr.split(/\s+/).filter(name => name.trim());

        const range = new vscode.Range(lineIndex, 0, lineIndex, definition.length);
        const location: SymbolLocation = {
            range,
            document: document.uri
        };

        // Add each declared terminal to the symbol table
        for (const terminalName of terminalNames) {
            // Validate that it's a valid terminal name (uppercase, can start with underscore)
            if (terminalName.match(/^[A-Z_][A-Z0-9_]*$/)) {
                const entry: SymbolTableEntry = {
                    name: terminalName,
                    type: 'terminal',
                    definition: location,
                    usages: [],
                    scope: this.symbolTable.getGlobalScope(),
                    isUsed: false,
                    isDeclared: true // Mark as declared vs defined
                };

                this.symbolTable.addSymbol(entry);
            }
        }

        return true;
    }

    /**
     * Tries to process a parameterized rule definition
     */
    private tryProcessParameterizedRule(document: vscode.TextDocument, definition: string, startLine: number, endLine: number): boolean {
        const match = definition.match(LarkDocumentAnalyzer.PATTERNS.PARAMETERIZED_RULE);
        if (!match) {
            return false;
        }

        const [, ruleName, parametersStr, body] = match;
        const parameters = this.parseParameters(parametersStr, startLine, document);

        const range = new vscode.Range(startLine, 0, endLine, definition.length);
        const location: SymbolLocation = {
            range,
            document: document.uri
        };

        const entry: SymbolTableEntry = {
            name: ruleName,
            type: 'rule',
            definition: location,
            usages: [],
            scope: this.symbolTable.getGlobalScope(),
            isUsed: false,
            isParameterized: true,
            baseRuleName: ruleName,
            parameters
        };

        this.symbolTable.addSymbol(entry);

        // Create a rule scope for this parameterized rule
        const ruleScope = this.symbolTable.createRuleScope(ruleName, range);

        // Add parameters as symbols in the rule scope
        for (const param of parameters) {
            const paramEntry: SymbolTableEntry = {
                name: param.name,
                type: 'parameter',
                definition: {
                    range: param.range,
                    document: document.uri
                },
                usages: [],
                scope: ruleScope,
                isUsed: false
            };
            this.symbolTable.addSymbol(paramEntry);
        }

        return true;
    }

    /**
     * Tries to process a regular rule definition
     */
    private tryProcessRule(document: vscode.TextDocument, definition: string, startLine: number, endLine: number): boolean {
        const match = definition.match(LarkDocumentAnalyzer.PATTERNS.RULE_DEFINITION);
        if (!match) {
            return false;
        }

        const [, ruleName, body] = match;

        const range = new vscode.Range(startLine, 0, endLine, definition.length);
        const location: SymbolLocation = {
            range,
            document: document.uri
        };

        const entry: SymbolTableEntry = {
            name: ruleName,
            type: 'rule',
            definition: location,
            usages: [],
            scope: this.symbolTable.getGlobalScope(),
            isUsed: false,
            isParameterized: false
        };

        this.symbolTable.addSymbol(entry);

        // Create a rule scope
        this.symbolTable.createRuleScope(ruleName, range);

        return true;
    }

    /**
     * Tries to process a terminal definition
     */
    private tryProcessTerminal(document: vscode.TextDocument, definition: string, startLine: number, endLine: number): boolean {
        const match = definition.match(LarkDocumentAnalyzer.PATTERNS.TERMINAL_DEFINITION);
        if (!match) {
            return false;
        }

        const [, terminalName, body] = match;

        const range = new vscode.Range(startLine, 0, endLine, definition.length);
        const location: SymbolLocation = {
            range,
            document: document.uri
        };

        const entry: SymbolTableEntry = {
            name: terminalName,
            type: 'terminal',
            definition: location,
            usages: [],
            scope: this.symbolTable.getGlobalScope(),
            isUsed: false
        };

        this.symbolTable.addSymbol(entry);
        return true;
    }

    /**
     * Tries to process a directive
     */
    private tryProcessDirective(document: vscode.TextDocument, definition: string, lineIndex: number): boolean {
        if (!definition.match(LarkDocumentAnalyzer.PATTERNS.DIRECTIVE)) {
            return false;
        }

        // For now, we just acknowledge directives but don't add them to symbol table
        // In the future, we could track directive scopes
        return true;
    }

    /**
     * Parses parameter list from a parameterized rule
     */
    private parseParameters(parametersStr: string, lineIndex: number, document: vscode.TextDocument): ParameterInfo[] {
        const parameters: ParameterInfo[] = [];
        const paramNames = parametersStr.split(',').map(p => p.trim());

        let currentColumn = 0;
        for (let i = 0; i < paramNames.length; i++) {
            const paramName = paramNames[i];
            const range = new vscode.Range(
                lineIndex, currentColumn,
                lineIndex, currentColumn + paramName.length
            );

            parameters.push({
                name: paramName,
                position: i,
                range
            });

            currentColumn += paramName.length + 2; // +2 for ", "
        }

        return parameters;
    }

    /**
     * Parses multi-import symbols from a parenthesized list
     * Supports: TERM1, TERM2, rule1, rule2 (no aliasing within parentheses)
     */
    private parseMultiImportSymbols(symbolsStr: string): Array<{ name: string, alias?: string }> {
        const symbols: Array<{ name: string, alias?: string }> = [];
        const symbolParts = symbolsStr.split(',').map(s => s.trim());

        for (const part of symbolParts) {
            // Multi-import does not support aliasing - only simple symbol names
            const name = part.trim();
            if (name.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
                symbols.push({ name });
            }
        }

        return symbols;
    }

    /**
     * Second pass: collect symbol references and validate usage
     */
    private async collectReferences(document: vscode.TextDocument, lines: string[]): Promise<void> {
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];

            // Skip empty lines and comments
            if (!line.trim() || this.isComment(line)) {
                continue;
            }

            // Process references in this line
            await this.processReferencesInLine(document, line, lineIndex);
        }
    }

    /**
     * Processes symbol references in a single line
     */
    private async processReferencesInLine(document: vscode.TextDocument, line: string, lineIndex: number): Promise<void> {
        // Remove comments from line
        const cleanLine = this.removeComments(line);

        // First, handle parameterized rule calls
        this.processParameterizedCalls(document, cleanLine, lineIndex);

        // Then handle regular symbol references
        this.processSymbolReferences(document, cleanLine, lineIndex);
    }

    /**
     * Processes parameterized rule calls
     */
    private processParameterizedCalls(document: vscode.TextDocument, line: string, lineIndex: number): void {
        const matches = Array.from(line.matchAll(LarkDocumentAnalyzer.PATTERNS.PARAMETERIZED_CALL));

        for (const match of matches) {
            const [fullMatch, ruleName, argsStr] = match;
            const startCol = match.index || 0;
            const endCol = startCol + fullMatch.length;

            const range = new vscode.Range(lineIndex, startCol, lineIndex, endCol);
            const location: SymbolLocation = {
                range,
                document: document.uri
            };

            // Mark the parameterized rule as used
            const symbol = this.symbolTable.resolveSymbol(ruleName);
            if (symbol && symbol.isParameterized) {
                this.symbolTable.markSymbolAsUsed(ruleName, location);
            }
        }
    }

    /**
     * Processes regular symbol references
     */
    private processSymbolReferences(document: vscode.TextDocument, line: string, lineIndex: number): void {
        // Skip lines that are definitions (contain colon before any symbol references)
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) {
            return; // No colon, not a definition line, but also no references to process
        }

        // Only process the part after the colon (the rule body)
        const ruleBody = line.substring(colonIndex + 1).trim();
        if (!ruleBody) {
            return; // Empty rule body
        }

        // Remove string literals and regex patterns to avoid false positives
        const cleanRuleBody = this.removeStringLiterals(ruleBody);

        // Reset the regex to start from the beginning
        LarkDocumentAnalyzer.PATTERNS.SYMBOL_REFERENCE.lastIndex = 0;

        let match;
        while ((match = LarkDocumentAnalyzer.PATTERNS.SYMBOL_REFERENCE.exec(cleanRuleBody)) !== null) {
            const symbolName = match[1];
            const startCol = colonIndex + 1 + match.index; // Adjust for the part before colon
            const endCol = startCol + symbolName.length;

            const range = new vscode.Range(lineIndex, startCol, lineIndex, endCol);
            const location: SymbolLocation = {
                range,
                document: document.uri
            };

            // Try to resolve and mark as used
            const symbol = this.symbolTable.resolveSymbol(symbolName);
            if (symbol) {
                this.symbolTable.markSymbolAsUsed(symbolName, location);
            }
        }
    }

    /**
     * Removes string literals from rule body to avoid false symbol matches
     */
    private removeStringLiterals(text: string): string {
        // Remove double-quoted strings
        let result = text.replace(/"[^"]*"/g, '""');
        // Remove single-quoted strings
        result = result.replace(/'[^']*'/g, "''");
        // Remove regex patterns
        result = result.replace(/\/[^\/]*\//g, '//');
        return result;
    }

    /**
     * Removes comments from a line or text
     */
    private removeComments(text: string): string {
        // Remove single-line comments (Lark only supports single-line comments)
        text = text.replace(LarkDocumentAnalyzer.PATTERNS.COMMENT, '');

        return text.trim();
    }

    /**
     * Checks if a line is a comment (Lark only supports single-line comments)
     */
    private isComment(line: string): boolean {
        const trimmed = line.trim();
        return trimmed.startsWith('//');
    }

    /**
     * Performs incremental analysis when a document changes
     * @param document The changed document
     * @param changes The changes that occurred
     */
    public async performIncrementalAnalysis(
        document: vscode.TextDocument,
        changes: readonly vscode.TextDocumentContentChangeEvent[]
    ): Promise<void> {
        // For now, we'll do a full re-analysis on any change
        // In the future, we could optimize this to only re-analyze affected areas
        await this.analyzeDocument(document);
    }

    // =======================================================================
    // PLANNED ARCHITECTURE METHODS (mapped to existing implementations)
    // =======================================================================

    /**
     * Parse import directive - maps to tryProcessImport
     */
    private parseImportDirective(document: vscode.TextDocument, definition: string, lineIndex: number): boolean {
        const cleanDefinition = this.removeComments(definition);
        return this.tryProcessImport(document, cleanDefinition, lineIndex);
    }

    /**
     * Parse declare directive - maps to tryProcessDeclare
     */
    private parseDeclareDirective(document: vscode.TextDocument, definition: string, lineIndex: number): boolean {
        const cleanDefinition = this.removeComments(definition);
        return this.tryProcessDeclare(document, cleanDefinition, lineIndex);
    }

    /**
     * Parse ignore directive - maps to tryProcessDirective (partial)
     */
    private parseIgnoreDirective(document: vscode.TextDocument, definition: string, lineIndex: number): boolean {
        const cleanDefinition = this.removeComments(definition);
        // Only process if it's an ignore directive
        if (cleanDefinition.startsWith('%ignore')) {
            this.tryProcessDirective(document, cleanDefinition, lineIndex);
            return true;
        }
        return false;
    }

    /**
     * Parse terminal definition - maps to tryProcessTerminal
     */
    private parseTerminalDefinition(document: vscode.TextDocument, definition: string, startLine: number, endLine: number): boolean {
        const cleanDefinition = this.removeComments(definition);
        return this.tryProcessTerminal(document, cleanDefinition, startLine, endLine);
    }

    /**
     * Parse rule definition - maps to tryProcessRule
     */
    private parseRuleDefinition(document: vscode.TextDocument, definition: string, startLine: number, endLine: number): boolean {
        const cleanDefinition = this.removeComments(definition);
        return this.tryProcessRule(document, cleanDefinition, startLine, endLine);
    }

    /**
     * Parse parameterized rule definition - maps to tryProcessParameterizedRule
     */
    private parseParameterizedRuleDefinition(document: vscode.TextDocument, definition: string, startLine: number, endLine: number): boolean {
        const cleanDefinition = this.removeComments(definition);
        return this.tryProcessParameterizedRule(document, cleanDefinition, startLine, endLine);
    }

    /**
     * Create global scope (already handled by clearDocument, but ensure it's proper)
     */
    private createGlobalScope(document: vscode.TextDocument): void {
        // Global scope is already created by clearDocument, but we can ensure it's properly initialized
        const globalScope = this.symbolTable.getGlobalScope();
        // Global scope is properly managed by the symbol table
    }

    /**
     * Create rule scopes for parameterized rules
     */
    private async createRuleScopes(document: vscode.TextDocument): Promise<void> {
        // Rule scopes are created automatically when parameterized rules are processed
        // in parseParameterizedRuleDefinition -> tryProcessParameterizedRule
        // This method ensures all parameterized rules have their scopes properly set up
    }

    /**
     * Link scope chain (establish parent-child relationships)
     */
    private linkScopeChain(): void {
        // Scope chains are established automatically when scopes are created
        // All rule scopes have the global scope as their parent
        // This method ensures the scope hierarchy is properly linked
    }

    // =======================================================================
    // INCREMENTAL UPDATE METHODS (for future implementation)
    // =======================================================================

    /**
     * Rebuild only the affected scopes (future implementation)
     */
    private async rebuildPartial(document: vscode.TextDocument, affectedScopes: LarkScope[]): Promise<void> {
        // TODO: Implement partial rebuilding
    }

    // STEP 6: INCREMENTAL UPDATES IMPLEMENTATION
    // =========================================

    /**
     * Main entry point for planned architecture - updates symbol table from document
     */
    public async updateFromDocument(document: vscode.TextDocument): Promise<void> {
        await this.analyzeDocument(document);
    }

    /**
     * Handle incremental document updates for performance optimization
     */
    public async updateFromTextChange(change: vscode.TextDocumentContentChangeEvent, document: vscode.TextDocument): Promise<void> {
        if (this.canUpdateIncremental(change, document)) {
            await this.updateIncremental(document, [change]);
        } else {
            // Fall back to full analysis for complex changes
            await this.analyzeDocument(document);
        }
    }

    /**
     * Update symbol table incrementally based on document changes
     */
    public async updateIncremental(document: vscode.TextDocument, changes: vscode.TextDocumentContentChangeEvent[]): Promise<void> {
        // Set document context for incremental update
        this.symbolTable.setDocumentContext(document.uri, document.version);

        try {
            // Step 1: Document change detection
            const affectedScopes = this.detectAffectedScopes(changes, document);

            if (affectedScopes.length === 0) {
                // No scopes affected, just update references if needed
                await this.updateReferencesOnly(document, changes);
                return;
            }

            // Step 2: Scope invalidation logic
            for (const scope of affectedScopes) {
                this.invalidateScope(scope);
            }

            // Step 3: Performance optimization - partial rebuild
            await this.rebuildAffectedScopes(document, affectedScopes);

        } catch (error) {
            console.warn('Incremental update failed, falling back to full analysis:', error);
            await this.analyzeDocument(document);
        }
    }

    /**
     * 1. Document change detection - determine if incremental update is viable
     */
    private canUpdateIncremental(change: vscode.TextDocumentContentChangeEvent, document: vscode.TextDocument): boolean {
        // Single change event analysis
        return this.canUpdateIncrementalMultiple([change], document);
    }

    private canUpdateIncrementalMultiple(changes: vscode.TextDocumentContentChangeEvent[], document: vscode.TextDocument): boolean {
        // Don't attempt incremental for complex scenarios
        if (changes.length > 5) {
            return false;
        }

        for (const change of changes) {
            // Skip incremental for changes that affect multiple lines
            if (change.range && change.range.start.line !== change.range.end.line) {
                return false;
            }

            // Skip incremental for changes that might affect imports or global directives
            const lineText = document.lineAt(change.range?.start.line || 0).text;
            if (this.isGlobalDirectiveLine(lineText)) {
                return false;
            }

            // Skip incremental for changes that might affect rule/terminal definitions
            if (this.isDefinitionLine(lineText) || this.isDefinitionLine(change.text)) {
                return false;
            }
        }

        return true;
    }

    /**
     * 1. Document change detection - detect which scopes are affected by changes
     */
    private detectAffectedScopes(changes: vscode.TextDocumentContentChangeEvent[], document: vscode.TextDocument): LarkScope[] {
        const affectedScopes = new Set<LarkScope>();

        for (const change of changes) {
            if (!change.range) {
                // Full document change - all scopes affected
                return this.getAllScopes();
            }

            // Find scopes that contain the change range
            const scopesInRange = this.getScopesInRange(change.range, document);
            scopesInRange.forEach(scope => affectedScopes.add(scope));

            // Check if change affects scope boundaries
            const lineBoundaryScopes = this.getScopesBoundingLines(change.range, document);
            lineBoundaryScopes.forEach(scope => affectedScopes.add(scope));
        }

        return Array.from(affectedScopes);
    }

    /**
     * 2. Scope invalidation logic - invalidate affected scopes
     */
    private invalidateScope(scope: LarkScope): void {
        // Clear symbols in this scope
        this.symbolTable.clearScope(scope);

        // Mark scope as needing rebuild
        scope.needsRebuild = true;

        // Invalidate dependent scopes (scopes that reference symbols from this scope)
        const dependentScopes = this.findDependentScopes(scope);
        for (const dependentScope of dependentScopes) {
            if (!dependentScope.needsRebuild) {
                this.invalidateScope(dependentScope);
            }
        }
    }

    /**
     * 3. Performance optimization - rebuild only affected scopes
     */
    private async rebuildAffectedScopes(document: vscode.TextDocument, affectedScopes: LarkScope[]): Promise<void> {
        const lines = document.getText().split('\n');

        // Sort scopes by dependency order (global first, then rules)
        const sortedScopes = this.sortScopesByDependency(affectedScopes);

        for (const scope of sortedScopes) {
            await this.rebuildScope(scope, document, lines);
        }

        // Update cross-references between rebuilt scopes
        this.updateCrossReferences(sortedScopes);
    }

    /**
     * Performance optimization - update only references without scope changes
     */
    private async updateReferencesOnly(document: vscode.TextDocument, changes: vscode.TextDocumentContentChangeEvent[]): Promise<void> {
        const lines = document.getText().split('\n');

        for (const change of changes) {
            if (!change.range) {
                continue;
            }

            // Update references only in changed lines
            for (let lineIndex = change.range.start.line; lineIndex <= change.range.end.line; lineIndex++) {
                if (lineIndex < lines.length) {
                    await this.processReferencesInLine(document, lines[lineIndex], lineIndex);
                }
            }
        }
    }

    // HELPER METHODS FOR INCREMENTAL UPDATES
    // ======================================

    private isGlobalDirectiveLine(line: string): boolean {
        const trimmed = line.trim();
        return /^%(import|declare|ignore|override|extend)\b/.test(trimmed);
    }

    private isDefinitionLine(text: string): boolean {
        const trimmed = text.trim();
        return LarkDocumentAnalyzer.PATTERNS.RULE_DEFINITION.test(trimmed) ||
            LarkDocumentAnalyzer.PATTERNS.TERMINAL_DEFINITION.test(trimmed) ||
            LarkDocumentAnalyzer.PATTERNS.PARAMETERIZED_RULE.test(trimmed);
    }

    private getAllScopes(): LarkScope[] {
        // Get all scopes from symbol table
        return this.symbolTable.getAllScopes();
    }

    private getScopesInRange(range: vscode.Range, document: vscode.TextDocument): LarkScope[] {
        // Find scopes that contain the given range
        return this.symbolTable.getScopesContaining(range);
    }

    private getScopesBoundingLines(range: vscode.Range, document: vscode.TextDocument): LarkScope[] {
        // Find scopes whose boundaries might be affected by the change
        const scopes: LarkScope[] = [];

        // Check if change is near scope boundaries (within 2 lines)
        const allScopes = this.getAllScopes();
        for (const scope of allScopes) {
            if (this.isRangeNearScopeBoundary(range, scope)) {
                scopes.push(scope);
            }
        }

        return scopes;
    }

    private isRangeNearScopeBoundary(range: vscode.Range, scope: LarkScope): boolean {
        const startLine = range.start.line;
        const endLine = range.end.line;
        const scopeStart = scope.range.start.line;
        const scopeEnd = scope.range.end.line;

        // Check if change is within 2 lines of scope boundaries
        return (Math.abs(startLine - scopeStart) <= 2) ||
            (Math.abs(endLine - scopeEnd) <= 2) ||
            (startLine >= scopeStart - 2 && endLine <= scopeEnd + 2);
    }

    private findDependentScopes(scope: LarkScope): LarkScope[] {
        // Find scopes that reference symbols from this scope
        // For now, return empty array - full implementation would check symbol references
        return [];
    }

    private sortScopesByDependency(scopes: LarkScope[]): LarkScope[] {
        // Sort scopes to ensure dependencies are rebuilt first
        return scopes.sort((a, b) => {
            // Global scope first, then by scope hierarchy
            if (a.type === 'global' && b.type !== 'global') {
                return -1;
            }
            if (b.type === 'global' && a.type !== 'global') {
                return 1;
            }

            // Then by line number (earlier scopes first)
            return a.range.start.line - b.range.start.line;
        });
    }

    private async rebuildScope(scope: LarkScope, document: vscode.TextDocument, lines: string[]): Promise<void> {
        // Rebuild only the symbols within this scope
        const startLine = scope.range.start.line;
        const endLine = scope.range.end.line;

        for (let lineIndex = startLine; lineIndex <= endLine && lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex].trim();

            if (!line || this.isComment(line)) {
                continue;
            }

            // Process definitions within this scope
            const fullDefinition = this.collectMultiLineDefinition(lines, lineIndex);
            const definitionText = fullDefinition.lines.join(' ').trim();

            if (scope.type === 'global') {
                // Global scope: process directives and top-level definitions
                if (this.parseImportDirective(document, definitionText, lineIndex) ||
                    this.parseDeclareDirective(document, definitionText, lineIndex) ||
                    this.parseParameterizedRuleDefinition(document, definitionText, lineIndex, fullDefinition.endLine) ||
                    this.parseRuleDefinition(document, definitionText, lineIndex, fullDefinition.endLine) ||
                    this.parseTerminalDefinition(document, definitionText, lineIndex, fullDefinition.endLine)) {
                    lineIndex = fullDefinition.endLine;
                }
            } else if (scope.type === 'rule') {
                // Rule scope: process parameter definitions and local symbols
                await this.processReferencesInLine(document, line, lineIndex);
            }
        }

        // Mark scope as rebuilt
        scope.needsRebuild = false;
    }

    private updateCrossReferences(scopes: LarkScope[]): void {
        // Update cross-references between rebuilt scopes
        // For now, this is a placeholder - full implementation would update
        // symbol references that cross scope boundaries
    }
}
