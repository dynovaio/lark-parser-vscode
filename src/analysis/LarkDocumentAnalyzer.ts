import * as vscode from 'vscode';
import { LarkSymbolTable, SymbolTypes, SymbolModifiers } from './LarkSymbolTable';
import type { SymbolDefinition, SymbolTableEntry, SymbolType, ParameterInfo, SymbolLocation } from './types.d';
import { LarkScope, ScopeTypes } from './LarkScope';
import { CONNREFUSED } from 'dns';

/**
 * Analyzes Lark grammar documents and populates the symbol table
 */
export class LarkDocumentAnalyzer {
    // The analyzer is now stateless and does not hold a symbol table instance.

    // Enhanced regex patterns for better parsing
    private static readonly PATTERNS = {
        // Comments
        COMMENT: /\/\/.*$/,

        // Directives
        // Only allowed: %ignore, %import, %declare, %override, %extend
        DIRECTIVE_STATEMENT: /^%(ignore|declare|override|extend|import)\b.*$/,

        // Ignore directive:
        // %ignore TERMINAL
        IGNORE_STATEMENT: /^%ignore\s+(.+)$/,

        // Declare directive:
        // %declare TERMINAL1 TERMINAL2 ...
        DECLARE_STATEMENT: /^%declare\s+(.+)$/,

        // Override directive:
        // %override TERMINAL: new_expression
        // %override rule_name: new_expression
        OVERRIDE_STATEMENT: /^%override\s+(.+)$/,

        // Extend directive:
        // %extend TERMINAL1: new_expression
        // %extend rule_name: new_expression
        EXTEND_STATEMENT: /^%extend\s+(.+)$/,

        // Import statements support five Lark formats:
        // 1. %import module.TERMINAL
        // 2. %import module.rule
        // 3. %import module.TERMINAL -> NEWTERMINAL
        // 4. %import module.rule -> newrule
        // 5. %import module (TERM1, TERM2, rule1, rule2)
        IMPORT_STATEMENT: /^%import\s+(.+)$/,
        IMPORT_STATEMENT_SINGLE: /^%import\s+([a-z0-9_.]+)\.([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:->\s*([a-zA-Z_][a-zA-Z0-9_]*))?\s*$/,
        IMPORT_STATEMENT_MULTI: /^%import\s+([a-z0-9_.]+)\s*\(\s*([^)]+)\s*\)\s*$/,

        // Terminal definitions: TERMINAL_NAME: expression (can start with underscore)
        TERMINAL_DEFINITION: /^([A-Z_][A-Z0-9_]*)(?:\.(\d+))?\s*:\s*(.+)/,

        // Rule definitions: rule_name: expression (can start with underscore)
        RULE_DEFINITION: /^([?!])?([a-z_][a-z0-9_]*)(?:\.(\d+))?\s*:\s*(.+)/,

        // Parameterized rules: rule_name{param1, param2}: expression (can start with underscore)
        TEMPLATE_RULE_DEFINITION: /^([?!])?([a-z_][a-z0-9_]*)\s*\{\s*([^}]+)\}(?:\.(\d+))?\s*:\s*(.+)/,

        // Alias statement
        ALIAS_DEFINITION: /^(.*)\s*->\s*([a-z_][a-z0-9_]*|[A-Z_][A-Z0-9_]*)\s*$/,

        // Symbol references in rule bodies (can start with underscore)
        TERMINAL_REFERENCE: /\b([A-Z_][A-Z0-9_]*)\b/,
        RULE_REFERENCE: /\b([a-z_][a-z0-9_]*)\b/,
        SYMBOL_REFERENCE: /\b([a-z_][a-z0-9_]*|[A-Z_][A-Z0-9_]*)\b/g,

        // Parameterized rule calls: rule_name{arg1, arg2} (can start with underscore)
        PARAMETERIZED_RULE_REFERENCE: /\b([a-z_][a-z0-9_]*)\s*\{\s*([^}]+)\}\b/g,

        // Continuation line reference
        CONTINUATION_LINE_REFERENCE: /^\|(.*)/
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
        await this.collectSymbolDefinitions(document, lines, symbolTable);
        // await this.collectSymbolReferences(document, lines, symbolTable);

        return symbolTable;
    }

    // ---------------------------------------------------------------------- //
    // First pass:
    // Collect symbol definitions
    // - Terminal definitions
    // - Rule definitions
    // - Parameterized rule definitions
    // - Directives (import, declare, override, extend)
    // ---------------------------------------------------------------------- //

    private async collectSymbolDefinitions(
        document: vscode.TextDocument,
        lines: string[],
        symbolTable: LarkSymbolTable
    ): Promise<void> {
        const globalScope = new LarkScope(ScopeTypes.GLOBAL, new vscode.Range(0, 0, 0, 0));

        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const currentLine = lines[lineNumber];
            const cleanedCurrentLine = this.removeComments(currentLine);

            if (!cleanedCurrentLine) {
                continue; // Skip empty lines
            }

            const definition = this.readSymbolDefinition(lines, lineNumber);

            if (definition.body !== '') {
                lineNumber = lineNumber + definition.endIndex - definition.startIndex; // Adjust line number

                this.processSymbolDefinition(
                    definition,
                    document,
                    symbolTable,
                    globalScope,
                )
            }
        }
    }

    private readSymbolDefinition(
        lines: string[],
        startIndex: number
    ): SymbolDefinition {
        let currentLine: string = lines[startIndex]
        let cleanedCurrentLine: string = this.removeComments(currentLine);

        if (!this.isSymbolDefinitionLine(cleanedCurrentLine)) {
            return {
                lines: [currentLine],
                body: '',
                startIndex: startIndex,
                endIndex: startIndex
            };
        }

        const collectedLines: string[] = [currentLine];
        const cleanCollectedLines: string[] = [cleanedCurrentLine];

        let currentIndex: number = startIndex + 1;

        for (currentLine of lines.slice(currentIndex)) {
            cleanedCurrentLine = this.removeComments(currentLine);

            // If `cleanedCurrentLine` is a new symbol definition line or
            // a directive line, we stop collecting
            if (this.isSymbolDefinitionLine(cleanedCurrentLine) || this.isDirectiveLine(cleanedCurrentLine)) {
                break;
            }

            collectedLines.push(currentLine);
            cleanCollectedLines.push(cleanedCurrentLine);

            currentIndex++;
        }

        // Remove empty lines at the end of the collected lines
        let deletedLinesCount = 0;
        for (currentLine of cleanCollectedLines.slice().reverse()) {
            if (currentLine === '') {
                deletedLinesCount++;
            } else {
                break;
            }
        }

        return {
            lines: collectedLines.slice(0, cleanCollectedLines.length - deletedLinesCount),
            body: cleanCollectedLines.join(' ').trim(),
            startIndex: startIndex,
            endIndex: currentIndex - deletedLinesCount - 1
        };
    }

    private processSymbolDefinition(
        definition: SymbolDefinition,
        document: vscode.TextDocument,
        symbolTable: LarkSymbolTable,
        scope: LarkScope
    ): void {
        const { body } = definition;

        let symbols: SymbolTableEntry[] = [];

        if (this.isTerminalDefinitionLine(body)) {
            symbols = this.processTerminalDefinition(definition, document, scope);
        } else if (this.isRuleDefinitionLine(body)) {
            symbols = this.processRuleDefinition(definition, document, scope);
        } else if (this.isTemplateRuleDefinitionLine(body)) {
            symbols = this.processTemplateRuleDefinition(definition, document, scope);
        } else if (this.isDeclareLine(body)) {
            symbols = this.processDeclareStatement(definition, document, scope);
        } else if (this.isImportLine(body)) {
            symbols = this.processImportStatement(definition, document, scope);
        }

        for (const symbol of symbols) {
            symbolTable.addSymbol(symbol);
        }
    }

    private processTerminalDefinition(
        definition: SymbolDefinition,
        document: vscode.TextDocument,
        scope: LarkScope
    ): SymbolTableEntry[] {
        const { lines: definitionLines, body: definitionBody, startIndex, endIndex } = definition;

        const match = definitionBody.match(LarkDocumentAnalyzer.PATTERNS.TERMINAL_DEFINITION);

        if (!match) {
            return []; // Not a valid terminal definition
        }

        const [, name, priority, body] = match;

        const symbol: SymbolTableEntry = {
            name,
            priority: priority ? parseInt(priority, 10) : 0,
            body: body ? body.trim() : '',
            isDefined: true,

            type: this.computeSymbolType(name),
            location: this.computeLocation(document, definitionLines, startIndex, endIndex),
            scope,

            usages: [],
            isUsed: false,

            isInlined: name.startsWith('_'),
        };

        return [
            symbol,
            ...this.processAliasWithinSymbolDefinition(definition, document, scope),
        ];
    }

    private processRuleDefinition(
        definition: SymbolDefinition,
        document: vscode.TextDocument,
        scope: LarkScope
    ): SymbolTableEntry[] {
        const { lines: definitionLines, body: definitionBody, startIndex, endIndex } = definition;

        const match = definitionBody.match(LarkDocumentAnalyzer.PATTERNS.RULE_DEFINITION);

        if (!match) {
            return []; // Not a valid rule definition
        }

        const [, modifier, name, priority, body] = match;
        const symbol: SymbolTableEntry = {
            name,
            priority: priority ? parseInt(priority, 10) : 0,
            body: body ? body.trim() : '',
            isDefined: true,

            type: this.computeSymbolType(name),
            location: this.computeLocation(document, definitionLines, startIndex, endIndex),
            scope,

            usages: [],
            isUsed: false,

            isInlined: name.startsWith('_'),
            isConditionallyInlined: modifier === SymbolModifiers.CONDITIONAL_INLINE,
            isPinned: modifier === SymbolModifiers.PIN,
        };

        return [
            symbol,
            ...this.processAliasWithinSymbolDefinition(definition, document, scope),
        ];
    }

    private processAliasWithinSymbolDefinition(
        definition: SymbolDefinition,
        document: vscode.TextDocument,
        scope: LarkScope
    ): SymbolTableEntry[] {
        const { lines: definitionLines, body: definitionBody, startIndex, endIndex } = definition;
        const symbols: SymbolTableEntry[] = [];
        let currentIndex = startIndex;

        for (let line of definitionLines) {
            let cleanedLine = this.removeComments(line);
            cleanedLine = this.extractAliasDefinitionStatement(cleanedLine) || '';

            if (cleanedLine) {
                const match = cleanedLine.match(LarkDocumentAnalyzer.PATTERNS.ALIAS_DEFINITION) || [];
                let [, body, name] = match;
                body = body.trim();
                name = name.trim();

                if (body.trim() && name.trim()) {
                    const symbol: SymbolTableEntry = {
                        name: name,
                        priority: 0,
                        body: body,
                        isDefined: true,

                        type: this.computeSymbolType(name),
                        location: this.computeLocation(document, [line], currentIndex, currentIndex, /[^\|\s]/),
                        scope,

                        usages: [],
                        isUsed: false,

                        isInlined: name.startsWith('_'),
                        isConditionallyInlined: false,
                        isPinned: false,

                        isAlias: true,
                        originalName: name,
                        originalType: this.computeSymbolType(name),
                    };

                    symbols.push(symbol);
                }
            }
            currentIndex++;
        }

        return symbols;
    }

    private processTemplateRuleDefinition(
        definition: SymbolDefinition,
        document: vscode.TextDocument,
        scope: LarkScope
    ): SymbolTableEntry[] {
        const { lines: definitionLines, body: definitionBody, startIndex, endIndex } = definition;

        const match = definitionBody.match(LarkDocumentAnalyzer.PATTERNS.TEMPLATE_RULE_DEFINITION);
        if (!match) {
            return []; // Not a valid template rule definition
        }

        const [, modifier, name, params, priority, body] = match;

        const symbol: SymbolTableEntry = {
            name,
            priority: priority ? parseInt(priority, 10) : 0,
            body: body ? body.trim() : '',
            isDefined: true,

            type: this.computeSymbolType(name),
            location: this.computeLocation(document, definitionLines, startIndex, endIndex),
            scope,

            usages: [],
            isUsed: false,

            isTemplated: true,
            baseRuleName: name,

            isInlined: name.startsWith('_'),
            isConditionallyInlined: modifier === SymbolModifiers.CONDITIONAL_INLINE,
            isPinned: modifier === SymbolModifiers.PIN,
        };

        return [symbol];
    }

    private processDeclareStatement(
        definition: SymbolDefinition,
        document: vscode.TextDocument,
        scope: LarkScope
    ): SymbolTableEntry[] {
        const { lines: definitionLines, body: definitionBody, startIndex, endIndex } = definition;

        const match = definitionBody.match(LarkDocumentAnalyzer.PATTERNS.DECLARE_STATEMENT);

        if (!match) {
            return []; // Not a valid declare statement
        }

        const [, terminals] = match;

        const terminalNames = terminals.split(/\s+/).filter(name => name);

        const symbols: SymbolTableEntry[] = terminalNames.map(name => ({
            name,
            priority: 0,
            body: '',
            isDefined: true,

            type: this.computeSymbolType(name),
            location: this.computeLocation(document, definitionLines, startIndex, endIndex),
            scope,

            usages: [],
            isUsed: false,

            isInlined: name.startsWith('_'),
            isConditionallyInlined: false,
            isPinned: false,

            isDeclared: true,
        }));

        return symbols;
    }

    private processImportStatement(
        definition: SymbolDefinition,
        document: vscode.TextDocument,
        scope: LarkScope
    ): SymbolTableEntry[] {
        const { lines: definitionLines, body: definitionBody, startIndex, endIndex } = definition;

        // Handle single import statements
        const matchSingle = definitionBody.match(LarkDocumentAnalyzer.PATTERNS.IMPORT_STATEMENT_SINGLE);
        if (matchSingle) {
            const [, moduleName, symbolName, newSymbolName] = matchSingle;

            const name = newSymbolName || symbolName;

            const symbol: SymbolTableEntry = {
                name,
                priority: 0,
                body: '',
                isDefined: true,

                type: this.computeSymbolType(name),
                location: this.computeLocation(document, definitionLines, startIndex, endIndex),
                scope,

                usages: [],
                isUsed: false,

                isInlined: name.startsWith('_'),

                isImported: true,
                importSource: moduleName,
                importName: symbolName,

                isAlias: !!newSymbolName,
                originalName: symbolName,
                originalType: this.computeSymbolType(symbolName),
            };

            return [symbol];
        }

        // Handle multi import statements
        const multiMatch = definitionBody.match(LarkDocumentAnalyzer.PATTERNS.IMPORT_STATEMENT_MULTI);

        if (multiMatch) {
            const [, moduleName, symbolNames] = multiMatch;

            const symbols = symbolNames.split(',').map(symbolName => {
                const name = symbolName.trim();

                return {
                    name,
                    priority: 0,
                    body: '',

                    type: this.computeSymbolType(name),
                    location: this.computeLocation(document, definitionLines, startIndex, endIndex),
                    scope,

                    usages: [],
                    isUsed: false,

                    isInlined: name.startsWith('_'),
                    isConditionallyInlined: false,
                    isPinned: false,

                    isImported: true,
                    importSource: moduleName,
                    importName: symbolName,
                };
            });

            return symbols;
        }

        return []; // Not a valid import statement
    }

    // ---------------------------------------------------------------------- //
    // Second pass:
    // Collect symbol references in rule bodies
    // - Terminal references
    // - Rule references
    // - Parameterized rule references
    // - Directive (ignore)
    // ---------------------------------------------------------------------- //

    // ---------------------------------------------------------------------- //
    // Utiltiy methods
    // ---------------------------------------------------------------------- //
    private removeComments(text: string): string {
        return text.replace(LarkDocumentAnalyzer.PATTERNS.COMMENT, '').trim();
    }

    /**
     * Check if a line is a symbol definition line.
     * @param {string} line - Line of text to  clean of comments and trimmed.
     * @returns {boolean} True if the line is a symbol definition line, false otherwise
     */
    private isSymbolDefinitionLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.TERMINAL_DEFINITION.test(line) ||
            LarkDocumentAnalyzer.PATTERNS.RULE_DEFINITION.test(line) ||
            LarkDocumentAnalyzer.PATTERNS.TEMPLATE_RULE_DEFINITION.test(line) ||
            this.isImportLine(line) ||
            this.isDeclareLine(line) ||
            this.isOverrideLine(line) ||
            this.isExtendLine(line);
    }

    private isTerminalDefinitionLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.TERMINAL_DEFINITION.test(line);
    }

    private isRuleDefinitionLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.RULE_DEFINITION.test(line);
    }

    private isTemplateRuleDefinitionLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.TEMPLATE_RULE_DEFINITION.test(line);
    }

    private isAliasDefinitionLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.ALIAS_DEFINITION.test(line);
    }

    private isDirectiveLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.DIRECTIVE_STATEMENT.test(line);
    }

    private isIgnoreLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.IGNORE_STATEMENT.test(line);
    }

    private isDeclareLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.DECLARE_STATEMENT.test(line);
    }

    private isOverrideLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.OVERRIDE_STATEMENT.test(line);
    }

    private isExtendLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.EXTEND_STATEMENT.test(line);
    }

    private isImportLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.IMPORT_STATEMENT.test(line);
    }

    private isContinuationLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.CONTINUATION_LINE_REFERENCE.test(line);
    }

    private isTerminal(name: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.TERMINAL_REFERENCE.test(name);
    }

    private isRule(name: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.RULE_REFERENCE.test(name);
    }

    private extractAliasDefinitionStatement(textLine: string): string | null {
        if (this.isTerminalDefinitionLine(textLine)) {
            let match = textLine.match(LarkDocumentAnalyzer.PATTERNS.TERMINAL_DEFINITION) || [];
            let body = match.at(-1)?.trim() || '';

            const [aliasStatement,] = body.match(LarkDocumentAnalyzer.PATTERNS.ALIAS_DEFINITION) || [];
            if (aliasStatement) {
                return aliasStatement.trim();
            }
        }

        if (this.isRuleDefinitionLine(textLine)) {
            let match = textLine.match(LarkDocumentAnalyzer.PATTERNS.RULE_DEFINITION) || [];
            let body = match.at(-1)?.trim() || '';

            const [aliasStatement,] = body.match(LarkDocumentAnalyzer.PATTERNS.ALIAS_DEFINITION) || [];
            if (aliasStatement) {
                return aliasStatement.trim();
            }
        }

        if (this.isTemplateRuleDefinitionLine(textLine)) {
            let match = textLine.match(LarkDocumentAnalyzer.PATTERNS.TEMPLATE_RULE_DEFINITION) || [];
            let body = match.at(-1)?.trim() || '';

            const [aliasStatement,] = body.match(LarkDocumentAnalyzer.PATTERNS.ALIAS_DEFINITION) || [];
            if (aliasStatement) {
                return aliasStatement.trim();
            }
        }

        if (this.isContinuationLine(textLine)) {
            let match = textLine.match(LarkDocumentAnalyzer.PATTERNS.CONTINUATION_LINE_REFERENCE) || [];
            let body = (match.at(-1)?.trim() || '').replace(/^\|\s*/, '').trim();

            const [aliasStatement,] = body.match(LarkDocumentAnalyzer.PATTERNS.ALIAS_DEFINITION) || [];
            if (aliasStatement) {
                return aliasStatement.trim();
            }
        }

        return null
    }

    private computeLocation(document: vscode.TextDocument, lines: string[], startIndex: number, endIndex: number, startMatcher: RegExp = /[^\s]/): SymbolLocation {
        const startLine = lines[0];
        const endLine = lines[lines.length - 1];

        return {
            range: new vscode.Range(
                new vscode.Position(startIndex, startLine.search(startMatcher)),
                new vscode.Position(endIndex, endLine.length)
            ),
            uri: document.uri
        };
    }

    private computeSymbolType(name: string): SymbolType {
        let computedSymbolType: SymbolType = SymbolTypes.UNKNOWN;

        if (this.isTerminal(name)) {
            computedSymbolType = SymbolTypes.TERMINAL;
        }

        if (this.isRule(name)) {
            computedSymbolType = SymbolTypes.RULE;
        }

        console.log(`Computed symbol type for "${name}": ${computedSymbolType}`);

        return computedSymbolType;
    }
}
