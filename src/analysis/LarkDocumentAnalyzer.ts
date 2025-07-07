import * as vscode from 'vscode';
import { LarkSymbolTable, SymbolTypes, SymbolModifiers } from './LarkSymbolTable';
import type { SymbolDefinition, SymbolTableEntry, SymbolType, ParameterInfo, SymbolLocation } from './types.d';
import { LarkScope, ScopeTypes } from './LarkScope';

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
        CONTINUATION_LINE_REFERENCE: /^\|\s*(.*)/
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
        await this.collectSymbolUsages(document, lines, symbolTable);

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
        const globalScope = symbolTable.getGlobalScope() as LarkScope;

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
        const location = this.computeLocation(document, definitionLines, startIndex, endIndex);
        const ruleScope = new LarkScope(
            ScopeTypes.RULE,
            location.range,
            name,
            scope,
        );

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
            parameters: this.processTemplateRuleParameters(definition, document, ruleScope),

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

            if (this.isAliasDefinitionLine(cleanedLine)) {
                const match = cleanedLine.match(LarkDocumentAnalyzer.PATTERNS.ALIAS_DEFINITION) || [];
                let [, body, name] = match;
                body = body.trim();
                name = name.trim();

                if (body.trim() && name.trim()) {
                    const location = this.computeLocation(document, [line], currentIndex, currentIndex, /[^\|\s]/);

                    const symbol: SymbolTableEntry = {
                        name: name,
                        priority: 0,
                        body: body,
                        isDefined: true,

                        type: this.computeSymbolType(name),
                        location,
                        scope,

                        // Alias definitions are within a symbol definition are considered used
                        usages: [
                            location,
                        ],
                        isUsed: true,

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

    private processTemplateRuleParameters(
        definition: SymbolDefinition,
        document: vscode.TextDocument,
        scope: LarkScope,
    ): ParameterInfo[] {
        const { body } = definition;
        const match = body.match(LarkDocumentAnalyzer.PATTERNS.TEMPLATE_RULE_DEFINITION);

        if (!match) {
            return [];
        }

        const [, , , params] = match;

        if (!params) {
            return [];
        }

        const parametersInfo: ParameterInfo[] = [];
        const paramNames = params.split(',').map(param => param.trim()).filter(param => param);
        const { lines: definitionLines, startIndex, endIndex } = definition;

        for (let i = 0; i < paramNames.length; i++) {
            const paramName = paramNames[i];
            const paramInfo: ParameterInfo = {
                name: paramName,
                position: i,
                range: new vscode.Range(
                    new vscode.Position(startIndex, definitionLines[0].search(paramName)),
                    new vscode.Position(startIndex, definitionLines[0].search(paramName) + paramName.length)
                ),
            };
            parametersInfo.push(paramInfo);
        }

        return parametersInfo;
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
    private async collectSymbolUsages(
        document: vscode.TextDocument,
        lines: string[],
        symbolTable: LarkSymbolTable
    ): Promise<void> {
        const globalScope = symbolTable.getGlobalScope() as LarkScope;

        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const currentLine = lines[lineNumber];
            const cleanedCurrentLine = this.removeComments(currentLine);

            if (!cleanedCurrentLine) {
                continue;
            }

            if (this.isDirectiveLine(cleanedCurrentLine)) {
                const processLines = await this.processSymbolUsagesWithinDirectives(lines, lineNumber, document, symbolTable, globalScope);
                lineNumber += processLines - 1; // Adjust line number based on directive processing
                continue; // Skip to the next line after processing directives
            }

            if (this.isSymbolDefinitionLine(cleanedCurrentLine)) {
                const processLines = await this.processSymbolUsagesWithinSymbolDefinitions(lines, lineNumber, document, symbolTable, globalScope);
                lineNumber += processLines - 1; // Adjust line number based on symbol definition processing
                continue; // Skip to the next line after processing symbol definitions
            }
        }
    }

    private async processSymbolUsagesWithinDirectives(lines: string[], startIndex: number, document: vscode.TextDocument, symbolTable: LarkSymbolTable, scope: LarkScope): Promise<number> {
        const currentLine = lines[startIndex];
        const cleanedCurrentLine = this.removeComments(currentLine);

        if (this.isIgnoreLine(cleanedCurrentLine)) {
            const match = cleanedCurrentLine.match(LarkDocumentAnalyzer.PATTERNS.IGNORE_STATEMENT);

            if (match) {
                const [, terminalName] = match;
                const symbol = symbolTable.resolveSymbol(terminalName, scope);
                if (symbol) {
                    const locationStart = currentLine.search(terminalName);
                    const locationEnd = locationStart + terminalName.length;
                    const location = {
                        range: new vscode.Range(
                            new vscode.Position(startIndex, locationStart),
                            new vscode.Position(startIndex, locationEnd)
                        ),
                        uri: document.uri
                    }
                    symbolTable.markSymbolAsUsed(
                        terminalName,
                        location,
                        scope
                    );
                    symbolTable.markSymbolAsIgnored(
                        terminalName,
                        location,
                        scope
                    );
                }
            }
        }

        // Directives only use one line
        return 1;
    }

    private async processSymbolUsagesWithinSymbolDefinitions(lines: string[], startIndex: number, document: vscode.TextDocument, symbolTable: LarkSymbolTable, scope: LarkScope): Promise<number> {
        const currentLine: string = lines[startIndex];
        const cleanedCurrentLine: string = this.removeComments(currentLine);

        let symbol: SymbolTableEntry | null = null;
        let match: RegExpMatchArray | null = null;
        let symbolName: string = '';

        if (this.isTemplateRuleDefinitionLine(cleanedCurrentLine)) {
            match = cleanedCurrentLine.match(LarkDocumentAnalyzer.PATTERNS.TEMPLATE_RULE_DEFINITION);
            symbolName = match ? match[2] : '';

            symbol = symbolTable.resolveSymbol(symbolName, scope);
        }

        if (this.isRuleDefinitionLine(cleanedCurrentLine)) {
            match = cleanedCurrentLine.match(LarkDocumentAnalyzer.PATTERNS.RULE_DEFINITION);
            symbolName = match ? match[2] : '';

            symbol = symbolTable.resolveSymbol(symbolName, scope);
        }

        if (this.isTerminalDefinitionLine(cleanedCurrentLine)) {
            match = cleanedCurrentLine.match(LarkDocumentAnalyzer.PATTERNS.TERMINAL_DEFINITION);
            symbolName = match ? match[1] : '';

            symbol = symbolTable.resolveSymbol(symbolName, scope);
        }

        if (symbol) {
            const startLineIndex = symbol.location.range.start.line;
            const endLineIndex = symbol.location.range.end.line;
            const definitionLines = lines.slice(startLineIndex, endLineIndex + 1);
            for (let rawLine of definitionLines) {
                let body = this.removeComments(rawLine);

                if (this.isTemplateRuleDefinitionLine(body)) {
                    match = body.match(LarkDocumentAnalyzer.PATTERNS.TEMPLATE_RULE_DEFINITION);
                    body = match ? match[5] : '';
                }

                if (this.isRuleDefinitionLine(body)) {
                    match = body.match(LarkDocumentAnalyzer.PATTERNS.RULE_DEFINITION);
                    body = match ? match[4] : '';
                }

                if (this.isTerminalDefinitionLine(body)) {
                    match = body.match(LarkDocumentAnalyzer.PATTERNS.TERMINAL_DEFINITION);
                    body = match ? match[3] : '';
                }

                if (this.isContinuationLine(body)) {
                    match = body.match(LarkDocumentAnalyzer.PATTERNS.CONTINUATION_LINE_REFERENCE);
                    body = match ? match[1] : '';
                }

                if (this.isAliasDefinitionLine(body)) {
                    match = body.match(LarkDocumentAnalyzer.PATTERNS.ALIAS_DEFINITION);
                    body = match ? match[1] : '';
                }

                while ((match = LarkDocumentAnalyzer.PATTERNS.SYMBOL_REFERENCE.exec(body)) !== null) {
                    symbolName = match[1];
                    symbol = symbolTable.resolveSymbol(symbolName, scope);

                    if (symbol) {
                        let maskedBody = this.maskLiterals(body);
                        let escapedBody = this.escapeLiterals(body);

                        const locationStart = rawLine.search(escapedBody) + maskedBody.search(symbolName);
                        const locationEnd = locationStart + symbolName.length;

                        const location = {
                            range: new vscode.Range(
                                new vscode.Position(startIndex, locationStart),
                                new vscode.Position(startIndex, locationEnd)
                            ),
                            uri: document.uri
                        };
                        symbolTable.markSymbolAsUsed(
                            symbolName,
                            location,
                            scope
                        );
                    }
                }
            }

            return endLineIndex - startIndex + 1; // Return the number of lines processed
        }

        return 1;
    }

    // ---------------------------------------------------------------------- //
    // Utility methods
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

        return computedSymbolType;
    }

    private maskLiterals(line: string): string {
        const STRING_LITERAL = /(?:"([^"]*)"([imslux]*))/g
        const REGEX_LITERAL = /(?:(\/[^\/]+\/)([imslux]*))/g
        const mask = (match: string): string => {
            return match.replace(/./g, '*');
        }

        return line
            .replace(STRING_LITERAL, mask)
            .replace(REGEX_LITERAL, mask);
    }

    private escapeLiterals(line: string): string {
        return line.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    }
}
