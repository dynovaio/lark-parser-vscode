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
        RULE_DEFINITION: /^([a-z_][a-z0-9_]*)\s*:\s*(.+)/,

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
        // Clear existing symbols for this document
        this.symbolTable.clearDocument(document.uri);

        // Set the symbol table's document tracking
        await this.symbolTable.updateFromDocument(document);

        const text = document.getText();
        const lines = text.split('\n');

        // First pass: collect all symbol definitions
        await this.collectDefinitions(document, lines);

        // Second pass: collect symbol references and validate
        await this.collectReferences(document, lines);
    }

    /**
     * First pass: collect all symbol definitions (rules, terminals, imports)
     */
    private async collectDefinitions(document: vscode.TextDocument, lines: string[]): Promise<void> {
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex].trim();

            // Skip empty lines and comments
            if (!line || this.isComment(line)) {
                continue;
            }

            // Handle multi-line rules by collecting continuation lines
            const fullDefinition = this.collectMultiLineDefinition(lines, lineIndex);
            const definitionLines = fullDefinition.lines;
            const definitionText = definitionLines.join(' ').trim();

            // Process the definition
            await this.processDefinition(document, definitionText, lineIndex, fullDefinition.endLine);

            // Skip the lines we've already processed
            lineIndex = fullDefinition.endLine;
        }
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
}
