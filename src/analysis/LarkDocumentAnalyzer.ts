import * as vscode from 'vscode';
import { LarkSymbolTable } from './LarkSymbolTable';
import type { SymbolTableEntry, SymbolType, ParameterInfo, SymbolLocation } from './types.d';
import { LarkScope } from './LarkScope';

/**
 * Analyzes Lark grammar documents and populates the symbol table
 */
export class LarkDocumentAnalyzer {
    // The analyzer is now stateless and does not hold a symbol table instance.

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

    /**
     * Analyzes a Lark document and returns a new symbol table.
     * This method is the main entry point for the stateless analyzer.
     * @param document The document to analyze.
     * @returns A new LarkSymbolTable populated with the analysis results.
     */
    public async analyze(document: vscode.TextDocument): Promise<LarkSymbolTable> {
        const symbolTable = new LarkSymbolTable();
        // The document context is no longer stored in the symbol table.
        // symbolTable.setDocumentContext(document.uri, document.version);

        const text = document.getText();
        const lines = text.split('\n');

        // The analysis process is now a pipeline that populates the new symbol table.
        await this.parseGlobalDirectives(document, lines, symbolTable);
        await this.parseSymbolDefinitions(document, lines, symbolTable);
        await this.buildScopeHierarchy(document, lines, symbolTable);
        await this.collectReferences(document, lines, symbolTable);

        return symbolTable;
    }

    /**
     * Analyzes a Lark document and populates the symbol table
     * @param document The document to analyze
     * @returns Promise that resolves when analysis is complete
     */
    public async analyzeDocument(document: vscode.TextDocument): Promise<void> {
        // This method is now deprecated and will be removed.
        // For now, it can be an alias for the new stateless analysis.
        const newSymbolTable = await this.analyze(document);
        // The old implementation modified a shared symbol table, which is no longer the case.
        // This method is kept for compatibility during refactoring but should not be used.
    }

    /**
     * First phase: Parse global directives (imports, declares, ignores)
     */
    private async parseGlobalDirectives(document: vscode.TextDocument, lines: string[], symbolTable: LarkSymbolTable): Promise<void> {
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
            if (this.parseImportDirective(document, definitionText, lineIndex, symbolTable) ||
                this.parseDeclareDirective(document, definitionText, lineIndex, symbolTable) ||
                this.parseIgnoreDirective(document, definitionText, lineIndex, symbolTable)) {
                // Skip the lines we've already processed
                lineIndex = fullDefinition.endLine;
            }
        }
    }

    /**
     * Second phase: Parse symbol definitions (terminals, rules, parameterized rules)
     */
    private async parseSymbolDefinitions(document: vscode.TextDocument, lines: string[], symbolTable: LarkSymbolTable): Promise<void> {
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
            if (this.parseParameterizedRuleDefinition(document, definitionText, lineIndex, fullDefinition.endLine, symbolTable) ||
                this.parseRuleDefinition(document, definitionText, lineIndex, fullDefinition.endLine, symbolTable) ||
                this.parseTerminalDefinition(document, definitionText, lineIndex, fullDefinition.endLine, symbolTable)) {
                // Skip the lines we've already processed
                lineIndex = fullDefinition.endLine;
            }
        }
    }

    /**
     * Third phase: Build scope hierarchy and link scope chains
     */
    private async buildScopeHierarchy(document: vscode.TextDocument, lines: string[], symbolTable: LarkSymbolTable): Promise<void> {
        // Create global scope (already handled by clearDocument, but ensure it's proper)
        this.createGlobalScope(document, symbolTable);

        // Create rule scopes for parameterized rules
        await this.createRuleScopes(document, symbolTable);

        // Link scope chain (establish parent-child relationships)
        this.linkScopeChain(symbolTable);
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
    private async processDefinition(document: vscode.TextDocument, definitionText: string, startLine: number, endLine: number, symbolTable: LarkSymbolTable): Promise<void> {
        // Remove comments from definition
        const cleanDefinition = this.removeComments(definitionText);

        // Try to match different types of definitions
        if (this.tryProcessImport(document, cleanDefinition, startLine, symbolTable)) {
            return;
        }

        if (this.tryProcessDeclare(document, cleanDefinition, startLine, symbolTable)) {
            return;
        }

        if (this.tryProcessParameterizedRule(document, cleanDefinition, startLine, endLine, symbolTable)) {
            return;
        }

        if (this.tryProcessRule(document, cleanDefinition, startLine, endLine, symbolTable)) {
            return;
        }

        if (this.tryProcessTerminal(document, cleanDefinition, startLine, endLine, symbolTable)) {
            return;
        }

        // If we can't identify the definition type, it might be a directive or other construct
        this.tryProcessDirective(document, cleanDefinition, startLine, symbolTable);
    }

    /**
     * Tries to process an import statement
     */
    private tryProcessImport(document: vscode.TextDocument, definition: string, lineIndex: number, symbolTable: LarkSymbolTable): boolean {
        // Try single symbol import first
        let match = definition.match(LarkDocumentAnalyzer.PATTERNS.IMPORT_STATEMENT_SINGLE);
        if (match) {
            const [, moduleName, symbolName, alias] = match;
            const finalName = alias || symbolName;

            const range = new vscode.Range(lineIndex, 0, lineIndex, definition.length);
            const location: SymbolLocation = {
                range,
                uri: document.uri
            };

            const entry: SymbolTableEntry = {
                name: finalName,
                type: 'imported',
                definition: location,
                usages: [],
                scope: symbolTable.getGlobalScope(),
                isUsed: false,
                importSource: moduleName,
                originalName: symbolName
            };

            symbolTable.addSymbol(entry);
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
                uri: document.uri
            };

            // Add each imported symbol to the symbol table
            for (const symbol of symbols) {
                const entry: SymbolTableEntry = {
                    name: symbol.alias || symbol.name,
                    type: 'imported',
                    definition: location,
                    usages: [],
                    scope: symbolTable.getGlobalScope(),
                    isUsed: false,
                    importSource: moduleName,
                    originalName: symbol.name
                };

                symbolTable.addSymbol(entry);
            }
            return true;
        }

        return false;
    }

    /**
     * Tries to process a declare directive
     */
    private tryProcessDeclare(document: vscode.TextDocument, definition: string, lineIndex: number, symbolTable: LarkSymbolTable): boolean {
        const match = definition.match(LarkDocumentAnalyzer.PATTERNS.DECLARE_DIRECTIVE);
        if (!match) {
            return false;
        }

        const [, terminalsStr] = match;
        const terminalNames = terminalsStr.split(/\s+/).filter(name => name.trim());

        const range = new vscode.Range(lineIndex, 0, lineIndex, definition.length);
        const location: SymbolLocation = {
            range,
            uri: document.uri
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
                    scope: symbolTable.getGlobalScope(),
                    isUsed: false,
                    isDeclared: true // Mark as declared vs defined
                };

                symbolTable.addSymbol(entry);
            }
        }

        return true;
    }

    /**
     * Tries to process a parameterized rule definition
     */
    private tryProcessParameterizedRule(document: vscode.TextDocument, definition: string, startLine: number, endLine: number, symbolTable: LarkSymbolTable): boolean {
        const match = definition.match(LarkDocumentAnalyzer.PATTERNS.PARAMETERIZED_RULE);
        if (!match) {
            return false;
        }

        const [, ruleName, parametersStr, body] = match;
        const parameters = this.parseParameters(parametersStr, startLine, document);

        const range = new vscode.Range(startLine, 0, endLine, definition.length);
        const location: SymbolLocation = {
            range,
            uri: document.uri
        };

        const entry: SymbolTableEntry = {
            name: ruleName,
            type: 'rule',
            definition: location,
            usages: [],
            scope: symbolTable.getGlobalScope(),
            isUsed: false,
            isParameterized: true,
            baseRuleName: ruleName,
            parameters
        };

        symbolTable.addSymbol(entry);

        // Create a rule scope for this parameterized rule
        const ruleScope = symbolTable.createRuleScope(ruleName, range);

        // Add parameters as symbols in the rule scope
        for (const param of parameters) {
            const paramEntry: SymbolTableEntry = {
                name: param.name,
                type: 'parameter',
                definition: {
                    range: param.range,
                    uri: document.uri
                },
                usages: [],
                scope: ruleScope,
                isUsed: false
            };
            symbolTable.addSymbol(paramEntry);
        }

        return true;
    }

    /**
     * Tries to process a regular rule definition
     */
    private tryProcessRule(document: vscode.TextDocument, definition: string, startLine: number, endLine: number, symbolTable: LarkSymbolTable): boolean {
        const match = definition.match(LarkDocumentAnalyzer.PATTERNS.RULE_DEFINITION);
        if (!match) {
            return false;
        }

        const [, ruleName, body] = match;

        const range = new vscode.Range(startLine, 0, endLine, definition.length);
        const location: SymbolLocation = {
            range,
            uri: document.uri
        };

        const entry: SymbolTableEntry = {
            name: ruleName,
            type: 'rule',
            definition: location,
            usages: [],
            scope: symbolTable.getGlobalScope(),
            isUsed: false,
            isParameterized: false
        };

        symbolTable.addSymbol(entry);

        // Create a rule scope
        symbolTable.createRuleScope(ruleName, range);

        return true;
    }

    /**
     * Tries to process a terminal definition
     */
    private tryProcessTerminal(document: vscode.TextDocument, definition: string, startLine: number, endLine: number, symbolTable: LarkSymbolTable): boolean {
        const match = definition.match(LarkDocumentAnalyzer.PATTERNS.TERMINAL_DEFINITION);
        if (!match) {
            return false;
        }

        const [, terminalName, body] = match;

        const range = new vscode.Range(startLine, 0, endLine, definition.length);
        const location: SymbolLocation = {
            range,
            uri: document.uri
        };

        const entry: SymbolTableEntry = {
            name: terminalName,
            type: 'terminal',
            definition: location,
            usages: [],
            scope: symbolTable.getGlobalScope(),
            isUsed: false
        };

        symbolTable.addSymbol(entry);
        return true;
    }

    /**
     * Tries to process a directive
     */
    private tryProcessDirective(document: vscode.TextDocument, definition: string, lineIndex: number, symbolTable: LarkSymbolTable): boolean {
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
    private async collectReferences(document: vscode.TextDocument, lines: string[], symbolTable: LarkSymbolTable): Promise<void> {
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];

            // Skip empty lines and comments
            if (!line.trim() || this.isComment(line)) {
                continue;
            }

            // Process references in this line
            await this.processReferencesInLine(document, line, lineIndex, symbolTable);
        }
    }

    /**
     * Processes symbol references in a single line
     */
    private async processReferencesInLine(document: vscode.TextDocument, line: string, lineIndex: number, symbolTable: LarkSymbolTable): Promise<void> {
        // Remove comments from line
        const cleanLine = this.removeComments(line);

        // First, handle parameterized rule calls
        this.processParameterizedCalls(document, cleanLine, lineIndex, symbolTable);

        // Then handle regular symbol references
        this.processSymbolReferences(document, cleanLine, lineIndex, symbolTable);
    }

    /**
     * Processes parameterized rule calls
     */
    private processParameterizedCalls(document: vscode.TextDocument, line: string, lineIndex: number, symbolTable: LarkSymbolTable): void {
        const matches = Array.from(line.matchAll(LarkDocumentAnalyzer.PATTERNS.PARAMETERIZED_CALL));

        for (const match of matches) {
            const [fullMatch, ruleName, argsStr] = match;
            const startCol = match.index || 0;
            const endCol = startCol + fullMatch.length;

            const range = new vscode.Range(lineIndex, startCol, lineIndex, endCol);
            const location: SymbolLocation = {
                range,
                uri: document.uri
            };

            // Mark the parameterized rule as used
            const symbol = symbolTable.resolveSymbol(ruleName);
            if (symbol && symbol.isParameterized) {
                symbolTable.markSymbolAsUsed(ruleName, location);
            }
        }
    }

    /**
     * Processes regular symbol references
     */
    private processSymbolReferences(document: vscode.TextDocument, line: string, lineIndex: number, symbolTable: LarkSymbolTable): void {
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
                uri: document.uri
            };

            // Try to resolve and mark as used
            const symbol = symbolTable.resolveSymbol(symbolName);
            if (symbol) {
                symbolTable.markSymbolAsUsed(symbolName, location);
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

    /**
     * Parse import directive - maps to tryProcessImport
     */
    private parseImportDirective(document: vscode.TextDocument, definition: string, lineIndex: number, symbolTable: LarkSymbolTable): boolean {
        const cleanDefinition = this.removeComments(definition);
        return this.tryProcessImport(document, cleanDefinition, lineIndex, symbolTable);
    }

    /**
     * Parse declare directive - maps to tryProcessDeclare
     */
    private parseDeclareDirective(document: vscode.TextDocument, definition: string, lineIndex: number, symbolTable: LarkSymbolTable): boolean {
        const cleanDefinition = this.removeComments(definition);
        return this.tryProcessDeclare(document, cleanDefinition, lineIndex, symbolTable);
    }

    /**
     * Parse ignore directive - maps to tryProcessDirective (partial)
     */
    private parseIgnoreDirective(document: vscode.TextDocument, definition: string, lineIndex: number, symbolTable: LarkSymbolTable): boolean {
        const cleanDefinition = this.removeComments(definition);
        // Only process if it's an ignore directive
        if (cleanDefinition.startsWith('%ignore')) {
            this.tryProcessDirective(document, cleanDefinition, lineIndex, symbolTable);
            return true;
        }
        return false;
    }

    /**
     * Parse terminal definition - maps to tryProcessTerminal
     */
    private parseTerminalDefinition(document: vscode.TextDocument, definition: string, startLine: number, endLine: number, symbolTable: LarkSymbolTable): boolean {
        const cleanDefinition = this.removeComments(definition);
        return this.tryProcessTerminal(document, cleanDefinition, startLine, endLine, symbolTable);
    }

    /**
     * Parse rule definition - maps to tryProcessRule
     */
    private parseRuleDefinition(document: vscode.TextDocument, definition: string, startLine: number, endLine: number, symbolTable: LarkSymbolTable): boolean {
        const cleanDefinition = this.removeComments(definition);
        return this.tryProcessRule(document, cleanDefinition, startLine, endLine, symbolTable);
    }

    /**
     * Parse parameterized rule definition - maps to tryProcessParameterizedRule
     */
    private parseParameterizedRuleDefinition(document: vscode.TextDocument, definition: string, startLine: number, endLine: number, symbolTable: LarkSymbolTable): boolean {
        const cleanDefinition = this.removeComments(definition);
        return this.tryProcessParameterizedRule(document, cleanDefinition, startLine, endLine, symbolTable);
    }

    /**
     * Create global scope (already handled by clearDocument, but ensure it's proper)
     */
    private createGlobalScope(document: vscode.TextDocument, symbolTable: LarkSymbolTable): void {
        // Global scope is already created by clearDocument, but we can ensure it's properly initialized
        const globalScope = symbolTable.getGlobalScope();
        // Global scope is properly managed by the symbol table
    }

    /**
     * Create rule scopes for parameterized rules
     */
    private async createRuleScopes(document: vscode.TextDocument, symbolTable: LarkSymbolTable): Promise<void> {
        // Rule scopes are created automatically when parameterized rules are processed
        // in parseParameterizedRuleDefinition -> tryProcessParameterizedRule
        // This method ensures all parameterized rules have their scopes properly set up
    }

    /**
     * Link scope chain (establish parent-child relationships)
     */
    private linkScopeChain(symbolTable: LarkSymbolTable): void {
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

    /**
     * Main entry point for planned architecture - updates symbol table from document
     */
    public async updateFromDocument(document: vscode.TextDocument): Promise<void> {
        // This method is now deprecated. Use analyze() instead.
        // await this.analyzeDocument(document);
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
        // Incremental updates are complex and not yet implemented in the new stateless architecture.
        // This method will need to be redesigned to work with a new symbol table instance.
        // For now, we will fall back to a full analysis.
        console.warn('Incremental update called, but not yet implemented in stateless analyzer. Falling back to full analysis.');
        await this.analyze(document);
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
        // This method is part of the old incremental update logic and needs to be adapted.
        // For now, it will return an empty array.
        return [];
    }

    /**
     * 2. Scope invalidation logic - invalidate affected scopes
     */
    private invalidateScope(scope: LarkScope): void {
        // This method is part of the old incremental update logic and is no longer valid
        // in a stateless analyzer. It is kept as a placeholder for future reimplementation.
    }

    /**
     * 3. Performance optimization - rebuild only affected scopes
     */
    private async rebuildAffectedScopes(document: vscode.TextDocument, affectedScopes: LarkScope[]): Promise<void> {
        // This method is part of the old incremental update logic and needs to be adapted.
    }

    /**
     * Performance optimization - update only references without scope changes
     */
    private async updateReferencesOnly(document: vscode.TextDocument, changes: vscode.TextDocumentContentChangeEvent[]): Promise<void> {
        // This method is part of the old incremental update logic and needs to be adapted.
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
        // This method is part of the old incremental update logic and needs to be adapted.
        // It requires a symbol table instance, which is no longer stored in the analyzer.
        return [];
    }

    private getScopesInRange(range: vscode.Range, document: vscode.TextDocument): LarkScope[] {
        // This method is part of the old incremental update logic and needs to be adapted.
        return [];
    }

    private getScopesBoundingLines(range: vscode.Range, document: vscode.TextDocument): LarkScope[] {
        // This method is part of the old incremental update logic and needs to be adapted.
        return [];
    }

    private isRangeNearScopeBoundary(range: vscode.Range, scope: LarkScope): boolean {
        // This method is part of the old incremental update logic and needs to be adapted.
        return false;
    }

    private findDependentScopes(scope: LarkScope): LarkScope[] {
        // This method is part of the old incremental update logic and needs to be adapted.
        return [];
    }

    private sortScopesByDependency(scopes: LarkScope[]): LarkScope[] {
        // This method is part of the old incremental update logic and needs to be adapted.
        return scopes;
    }

    private async rebuildScope(scope: LarkScope, document: vscode.TextDocument, lines: string[]): Promise<void> {
        // This method is part of the old incremental update logic and needs to be adapted.
    }
}
