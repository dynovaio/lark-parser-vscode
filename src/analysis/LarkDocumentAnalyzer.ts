import * as vscode from 'vscode';
import { LarkSymbolTable, SymbolTypes, SymbolModifiers } from './LarkSymbolTable';
import type { AnalysisResult, SymbolDefinition, SymbolTableEntry, SymbolType, ParameterInfo, SymbolLocation, UndefinedSymbolTable } from './types.d';
import { LarkScope, ScopeTypes } from './LarkScope';

/**
 * Analyzes Lark grammar documents and populates the symbol table
 */
export class LarkDocumentAnalyzer {
    private static readonly PATTERNS = {
        // Comments
        COMMENT: /\/\/.*$/,

        // Directives
        // Only allowed:
        // 1. %ignore
        // 2. %import
        // 3. %declare
        // 4. %override
        // 5. %extend
        DIRECTIVE_STATEMENT: /^%(ignore|declare|override|extend|import)\b.*$/,

        // Ignore directive:
        // %ignore TERMINAL
        IGNORE_STATEMENT: /^%ignore\s+(.+)$/,

        // Declare directive:
        // %declare TERMINAL1 TERMINAL2 ...
        DECLARE_STATEMENT: /^%declare\s+(.+)$/,

        // Override directive:
        // 1. %override TERMINAL: new_expression
        // 2.%override rule_name: new_expression
        OVERRIDE_STATEMENT: /^%override\s+(.+)$/,

        // Extend directive:
        // 1. %extend TERMINAL1: new_expression
        // 2. %extend rule_name: new_expression
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

        // Terminal definitions:
        // 1. TERMINAL_NAME: expression (can start with underscore)
        TERMINAL_DEFINITION: /^([A-Z_][A-Z0-9_]*)(?:\.(\d+))?\s*:\s*(.+)/,

        // Rule definitions:
        // 1. rule_name: expression (can start with underscore)
        RULE_DEFINITION: /^([?!])?([a-z_][a-z0-9_]*)(?:\.(\d+))?\s*:\s*(.+)/,

        // Template rules:
        // 1. rule_name{param1, param2}: expression (can start with underscore)
        TEMPLATE_RULE_DEFINITION: /^([?!])?([a-z_][a-z0-9_]*)\s*\{\s*([^}]+)\}(?:\.(\d+))?\s*:\s*(.+)/,

        // Alias statement
        // 1. expression -> alias_name
        ALIAS_DEFINITION: /^(.*)\s*->\s*([a-z_][a-z0-9_]*|[A-Z_][A-Z0-9_]*)\s*$/,

        // Symbol references in rule bodies (can start with underscore)
        // 1. TERMINAL_REFERENCE: /\b([A-Z_][A-Z0-9_]*)\b/
        // 2. RULE_REFERENCE: /\b([a-z_][a-z0-9_]*)\b/
        // 3. SYMBOL_REFERENCE: /\b([a-z_][a-z0-9_]*|[A-Z_][A-Z0-9_]*)\b/g
        SYMBOL_REFERENCE: /\b([a-z_][a-z0-9_]*|[A-Z_][A-Z0-9_]*)\b/g,
        TERMINAL_REFERENCE: /\b([A-Z_][A-Z0-9_]*)\b/,
        RULE_REFERENCE: /\b([a-z_][a-z0-9_]*)\b/,
        TEMPLATE_RULE_REFERENCE: /\b([a-z_][a-z0-9_]*)\s*\{\s*([^}]+)\}\b/g,

        // Continuation line reference
        // 1. | expression
        CONTINUATION_LINE_REFERENCE: /^\|\s*(.*)/
    };

    /**
     * Analyzes a Lark document and returns a new symbol table.
     * This method is the main entry point for the stateless analyzer.
     * @param document The document to analyze.
     * @returns A new LarkSymbolTable populated with the analysis results.
     */
    public async analyze(document: vscode.TextDocument): Promise<AnalysisResult> {
        const symbolTable = new LarkSymbolTable();
        const undefinedSymbolTable: UndefinedSymbolTable = new Map();
        const text = document.getText();
        const lines = text.split('\n');

        await this.collectSymbolDefinitions(document, lines, symbolTable);
        await this.collectSymbolUsages(document, lines, symbolTable, undefinedSymbolTable);

        return {
            symbolTable,
            undefinedSymbolTable
        };
    }

    // ---------------------------------------------------------------------- //
    // First pass:
    // Collect symbol definitions
    // - Terminal definitions
    // - Rule definitions
    // - Template rule definitions
    // - Directives (import, declare, override, extend)
    // ---------------------------------------------------------------------- //

    /**
     * Collects all symbol definitions from the document in the first pass.
     * This includes terminals, rules, template rules, and directives.
     * @param document The VS Code document being analyzed
     * @param lines Array of lines from the document
     * @param symbolTable The symbol table to populate with definitions
     * @returns Promise that resolves when all symbol definitions are collected
     */
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
                continue;
            }

            const definition = this.readSymbolDefinition(lines, lineNumber);

            if (definition.body !== '') {
                lineNumber = lineNumber + definition.endIndex - definition.startIndex;

                this.processSymbolDefinition(
                    definition,
                    document,
                    symbolTable,
                    globalScope,
                );
            }
        }
    }

    /**
     * Reads a complete symbol definition from the document, handling multi-line definitions.
     * Collects all lines that belong to a single symbol definition, including continuation lines.
     * @param lines Array of all lines in the document
     * @param startIndex The starting line index to read from
     * @returns A SymbolDefinition object containing the collected lines and metadata
     */
    private readSymbolDefinition(
        lines: string[],
        startIndex: number
    ): SymbolDefinition {
        let currentLine: string = lines[startIndex];
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

    /**
     * Processes a symbol definition and creates appropriate symbol table entries.
     * Determines the type of definition (terminal, rule, template rule, directive) and
     * delegates to the appropriate processing method.
     * @param definition The symbol definition to process
     * @param document The VS Code document being analyzed
     * @param symbolTable The symbol table to add symbols to
     * @param scope The scope in which to add the symbols
     */
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

    /**
     * Processes a terminal definition and creates a terminal symbol table entry.
     * Handles terminal definitions like "TERMINAL_NAME: expression" and extracts
     * priority information if present.
     * @param definition The terminal definition to process
     * @param document The VS Code document being analyzed
     * @param scope The scope in which to add the terminal symbol
     * @returns Array of symbol table entries created from the definition
     */
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

    /**
     * Processes a rule definition and creates a rule symbol table entry.
     * Handles rule definitions like "rule_name: expression" and extracts
     * modifiers (!, ?) and priority information if present.
     * @param definition The rule definition to process
     * @param document The VS Code document being analyzed
     * @param scope The scope in which to add the rule symbol
     * @returns Array of symbol table entries created from the definition
     */
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

    /**
     * Processes a template (template) rule definition and creates a template rule symbol table entry.
     * Handles template rules like "rule_name{param1, param2}: expression" and creates
     * a new rule scope for the parameters.
     * @param definition The template rule definition to process
     * @param document The VS Code document being analyzed
     * @param scope The scope in which to add the template rule symbol
     * @returns Array of symbol table entries created from the definition
     */
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

        const [, modifier, name, , priority, body] = match;
        const location = this.computeLocation(document, definitionLines, startIndex, endIndex);
        const parameters = this.processTemplateRuleParameters(definition);
        const ruleScope = new LarkScope(
            ScopeTypes.RULE,
            location.range,
            name,
            scope,
        );
        if (parameters.length > 0) {
            for (const param of parameters) {
                ruleScope.addParameter(param);
            }
        }

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

            isTemplate: true,
            baseRuleName: name,
            parameters,

            isInlined: name.startsWith('_'),
            isConditionallyInlined: modifier === SymbolModifiers.CONDITIONAL_INLINE,
            isPinned: modifier === SymbolModifiers.PIN,
        };

        return [
            symbol,
            ...this.processAliasWithinSymbolDefinition(definition, document, scope),
        ];
    }

    /**
     * Processes alias definitions within a symbol definition.
     * Handles alias statements like "expression -> alias_name" that can appear
     * within rule or terminal definitions.
     * @param definition The symbol definition that may contain aliases
     * @param document The VS Code document being analyzed
     * @param scope The scope in which to add the alias symbols
     * @returns Array of alias symbol table entries found within the definition
     */
    private processAliasWithinSymbolDefinition(
        definition: SymbolDefinition,
        document: vscode.TextDocument,
        scope: LarkScope
    ): SymbolTableEntry[] {
        const { lines: definitionLines, startIndex } = definition;
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

    /**
     * Processes the parameters of a template rule definition.
     * Extracts parameter names and their positions from template rule definitions
     * like "rule_name{param1, param2}: expression".
     * @param definition The template rule definition containing parameters
     * @param document The VS Code document being analyzed
     * @param scope The rule scope to add parameters to
     * @returns Array of parameter information objects
     */
    private processTemplateRuleParameters(
        definition: SymbolDefinition,
        // document: vscode.TextDocument,
        // scope: LarkScope,
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
        const { lines: definitionLines, startIndex } = definition;

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

    /**
     * Processes a declare statement and creates declared symbol table entries.
     * Handles declare statements like "%declare TERMINAL1 TERMINAL2" which declare
     * terminals without providing their definitions.
     * @param definition The declare statement definition to process
     * @param document The VS Code document being analyzed
     * @param scope The scope in which to add the declared symbols
     * @returns Array of declared symbol table entries
     */
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

    /**
     * Processes an import statement and creates imported symbol table entries.
     * Handles both single imports ("%import module.symbol") and multi-imports
     * ("%import module (symbol1, symbol2)") with optional aliasing.
     * @param definition The import statement definition to process
     * @param document The VS Code document being analyzed
     * @param scope The scope in which to add the imported symbols
     * @returns Array of imported symbol table entries
     */
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
    // - Template rule references
    // - Directive (ignore)
    // ---------------------------------------------------------------------- //

    /**
     * Collects all symbol usages from the document in the second pass.
     * This includes references to terminals, rules, and template rules within
     * rule bodies, as well as symbols used in directives like %ignore.
     * @param document The VS Code document being analyzed
     * @param lines Array of lines from the document
     * @param symbolTable The symbol table to mark symbol usages in
     * @returns Promise that resolves when all symbol usages are collected
     */
    private async collectSymbolUsages(
        document: vscode.TextDocument,
        lines: string[],
        symbolTable: LarkSymbolTable,
        undefinedSymbolTable: UndefinedSymbolTable
    ): Promise<void> {
        const globalScope = symbolTable.getGlobalScope() as LarkScope;

        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const currentLine = lines[lineNumber];
            const cleanedCurrentLine = this.removeComments(currentLine);

            if (!cleanedCurrentLine) {
                continue;
            }

            if (this.isDirectiveLine(cleanedCurrentLine)) {
                const processLines = await this.processSymbolUsagesWithinDirectives(lines, lineNumber, document, symbolTable, undefinedSymbolTable, globalScope);
                lineNumber += processLines - 1; // Adjust line number based on directive processing
                continue; // Skip to the next line after processing directives
            }

            if (this.isSymbolDefinitionLine(cleanedCurrentLine)) {
                const processLines = await this.processSymbolUsagesWithinSymbolDefinitions(lines, lineNumber, document, symbolTable, undefinedSymbolTable, globalScope);
                lineNumber += processLines - 1; // Adjust line number based on symbol definition processing
                continue; // Skip to the next line after processing symbol definitions
            }
        }
    }

    /**
     * Processes symbol usages within directive statements.
     * Currently handles %ignore directives which mark symbols as both used and ignored.
     * @param lines Array of all lines in the document
     * @param startIndex The starting line index of the directive
     * @param document The VS Code document being analyzed
     * @param symbolTable The symbol table to mark symbol usages in
     * @param scope The scope to search for symbols in
     * @returns Promise resolving to the number of lines processed
     */
    private async processSymbolUsagesWithinDirectives(lines: string[], startIndex: number, document: vscode.TextDocument, symbolTable: LarkSymbolTable, undefinedSymbolTable: UndefinedSymbolTable, scope: LarkScope): Promise<number> {
        const currentLine = lines[startIndex];
        const cleanedCurrentLine = this.removeComments(currentLine);

        if (this.isIgnoreLine(cleanedCurrentLine)) {
            const maskedCurrentLine = this.maskLiterals(cleanedCurrentLine);
            const match = maskedCurrentLine.match(LarkDocumentAnalyzer.PATTERNS.IGNORE_STATEMENT);

            if (!match) {
                return 1; // Not a valid ignore statement
            }

            const [, terminalName] = match;

            if (!terminalName.match(LarkDocumentAnalyzer.PATTERNS.SYMBOL_REFERENCE)) {
                return 1; // Not a valid symbol reference
            }

            const locationStart = currentLine.search(this.escapeLiterals(terminalName));
            const locationEnd = locationStart + terminalName.length;
            const location = {
                range: new vscode.Range(
                    new vscode.Position(startIndex, locationStart),
                    new vscode.Position(startIndex, locationEnd)
                ),
                uri: document.uri
            };
            const symbol = symbolTable.resolveSymbol(terminalName, scope);
            if (symbol) {
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
            } else {
                this.handleUndefinedSymbol(
                    terminalName,
                    location,
                    scope,
                    undefinedSymbolTable,
                    {
                        isIgnored: true,
                        ignoreLocations: [location],
                    }
                );
            }
        }

        // Directives only use one line
        return 1;
    }

    /**
     * Processes symbol usages within symbol definition bodies.
     * Extracts and marks all symbol references found in rule bodies, terminal definitions,
     * and template rule definitions while avoiding false positives in string literals.
     * @param lines Array of all lines in the document
     * @param startIndex The starting line index of the symbol definition
     * @param document The VS Code document being analyzed
     * @param symbolTable The symbol table to mark symbol usages in
     * @param scope The scope to search for symbols in
     * @returns Promise resolving to the number of lines processed
     */
    private async processSymbolUsagesWithinSymbolDefinitions(lines: string[], startIndex: number, document: vscode.TextDocument, symbolTable: LarkSymbolTable, undefinedSymbolTable: UndefinedSymbolTable, scope: LarkScope): Promise<number> {
        const currentLine: string = lines[startIndex];
        const cleanedCurrentLine: string = this.removeComments(currentLine);

        let definedSymbol: SymbolTableEntry | null = null;
        let usedSymbol: SymbolTableEntry | null = null;
        let match: RegExpMatchArray | null = null;
        let symbolName: string = '';

        if (this.isTemplateRuleDefinitionLine(cleanedCurrentLine)) {
            match = cleanedCurrentLine.match(LarkDocumentAnalyzer.PATTERNS.TEMPLATE_RULE_DEFINITION);
            symbolName = match ? match[2] : '';

            definedSymbol = symbolTable.resolveSymbol(symbolName, scope);
        }

        if (this.isRuleDefinitionLine(cleanedCurrentLine)) {
            match = cleanedCurrentLine.match(LarkDocumentAnalyzer.PATTERNS.RULE_DEFINITION);
            symbolName = match ? match[2] : '';

            definedSymbol = symbolTable.resolveSymbol(symbolName, scope);
        }

        if (this.isTerminalDefinitionLine(cleanedCurrentLine)) {
            match = cleanedCurrentLine.match(LarkDocumentAnalyzer.PATTERNS.TERMINAL_DEFINITION);
            symbolName = match ? match[1] : '';

            definedSymbol = symbolTable.resolveSymbol(symbolName, scope);
        }

        if (definedSymbol) {
            const startLineIndex = definedSymbol.location.range.start.line;
            const endLineIndex = definedSymbol.location.range.end.line;
            const definitionLines = lines.slice(startLineIndex, endLineIndex + 1);
            for (let rawLine of definitionLines) {
                console.log("Raw line:", rawLine);

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

                // Apply masking before searching for symbol references
                let maskedBody = this.maskLiterals(body);

                while ((match = LarkDocumentAnalyzer.PATTERNS.SYMBOL_REFERENCE.exec(maskedBody)) !== null) {
                    console.log("Match found:", match);
                    symbolName = match[1];
                    usedSymbol = symbolTable.resolveSymbol(symbolName, scope);

                    const escapedBody = this.escapeLiterals(body);
                    const locationStart = rawLine.search(escapedBody) + maskedBody.search(this.escapeLiterals(symbolName));
                    const locationEnd = locationStart + symbolName.length;

                    const location = {
                        range: new vscode.Range(
                            new vscode.Position(startIndex, locationStart),
                            new vscode.Position(startIndex, locationEnd)
                        ),
                        uri: document.uri
                    };

                    if (usedSymbol) {
                        symbolTable.markSymbolAsUsed(
                            symbolName,
                            location,
                            scope
                        );
                    } else {
                        if (definedSymbol.isTemplate) {
                            const parameterInfo = definedSymbol.parameters?.find(param => param.name === symbolName);
                            if (parameterInfo) {
                                continue; // Skip parameters, they are not undefined symbols
                            }
                        } else {
                            this.handleUndefinedSymbol(
                                symbolName,
                                location,
                                scope,
                                undefinedSymbolTable
                            );
                        }
                    }
                }
            }

            return endLineIndex - startIndex + 1; // Return the number of lines processed
        }

        return 1;
    }

    private handleUndefinedSymbol(
        symbolName: string,
        location: vscode.Location,
        scope: LarkScope,
        undefinedSymbolTable: UndefinedSymbolTable,
        extraAttributes: Record<string, unknown> = {}
    ): void {
        let undefinedSymbol = undefinedSymbolTable.get(symbolName);

        if (undefinedSymbol) {
            undefinedSymbol = {
                ...undefinedSymbol,
                ...extraAttributes,
                usages: [...undefinedSymbol.usages, location],
            };
        } else {
            undefinedSymbol = {
                name: symbolName,
                isDefined: false,

                type: this.computeSymbolType(symbolName),
                scope,
                location,

                isUsed: true,
                usages: [location],

                isInlined: symbolName.startsWith('_'),

                ...extraAttributes,
            };
        }

        undefinedSymbolTable.set(symbolName, undefinedSymbol);
    }
    // ---------------------------------------------------------------------- //
    // Utility methods
    // ---------------------------------------------------------------------- //

    /**
     * Removes comments from a line of text.
     * Strips everything after "//" comment markers and trims whitespace.
     * @param text The text to remove comments from
     * @returns The text with comments removed and trimmed
     */
    private removeComments(text: string): string {
        return text.replace(LarkDocumentAnalyzer.PATTERNS.COMMENT, '').trim();
    }

    /**
     * Check if a line is a symbol definition line.
     * Identifies terminal definitions, rule definitions, template rules, and directives.
     * @param line Line of text to check (should be clean of comments and trimmed)
     * @returns True if the line is a symbol definition line, false otherwise
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

    /**
     * Checks if a line is a terminal definition.
     * Matches patterns like "TERMINAL_NAME: expression".
     * @param line The line to check
     * @returns True if the line is a terminal definition
     */
    private isTerminalDefinitionLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.TERMINAL_DEFINITION.test(line);
    }

    /**
     * Checks if a line is a rule definition.
     * Matches patterns like "rule_name: expression" with optional modifiers.
     * @param line The line to check
     * @returns True if the line is a rule definition
     */
    private isRuleDefinitionLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.RULE_DEFINITION.test(line);
    }

    /**
     * Checks if a line is a template (template) rule definition.
     * Matches patterns like "rule_name{param1, param2}: expression".
     * @param line The line to check
     * @returns True if the line is a template rule definition
     */
    private isTemplateRuleDefinitionLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.TEMPLATE_RULE_DEFINITION.test(line);
    }

    /**
     * Checks if a line is an alias definition.
     * Matches patterns like "expression -> alias_name".
     * @param line The line to check
     * @returns True if the line is an alias definition
     */
    private isAliasDefinitionLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.ALIAS_DEFINITION.test(line);
    }

    /**
     * Checks if a line is a directive statement.
     * Matches patterns like "%ignore", "%import", "%declare", etc.
     * @param line The line to check
     * @returns True if the line is a directive statement
     */
    private isDirectiveLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.DIRECTIVE_STATEMENT.test(line);
    }

    /**
     * Checks if a line is an ignore directive.
     * Matches patterns like "%ignore TERMINAL".
     * @param line The line to check
     * @returns True if the line is an ignore directive
     */
    private isIgnoreLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.IGNORE_STATEMENT.test(line);
    }

    /**
     * Checks if a line is a declare directive.
     * Matches patterns like "%declare TERMINAL1 TERMINAL2".
     * @param line The line to check
     * @returns True if the line is a declare directive
     */
    private isDeclareLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.DECLARE_STATEMENT.test(line);
    }

    /**
     * Checks if a line is an override directive.
     * Matches patterns like "%override symbol: expression".
     * @param line The line to check
     * @returns True if the line is an override directive
     */
    private isOverrideLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.OVERRIDE_STATEMENT.test(line);
    }

    /**
     * Checks if a line is an extend directive.
     * Matches patterns like "%extend symbol: expression".
     * @param line The line to check
     * @returns True if the line is an extend directive
     */
    private isExtendLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.EXTEND_STATEMENT.test(line);
    }

    /**
     * Checks if a line is an import directive.
     * Matches patterns like "%import module.symbol" or "%import module (symbols)".
     * @param line The line to check
     * @returns True if the line is an import directive
     */
    private isImportLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.IMPORT_STATEMENT.test(line);
    }

    /**
     * Checks if a line is a continuation line.
     * Matches patterns like "| expression" which continue the previous rule.
     * @param line The line to check
     * @returns True if the line is a continuation line
     */
    private isContinuationLine(line: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.CONTINUATION_LINE_REFERENCE.test(line);
    }

    /**
     * Checks if a symbol name is a terminal.
     * Terminals are uppercase identifiers that can start with underscore.
     * @param name The symbol name to check
     * @returns True if the name is a terminal
     */
    private isTerminal(name: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.TERMINAL_REFERENCE.test(name);
    }

    /**
     * Checks if a symbol name is a rule.
     * Rules are lowercase identifiers that can start with underscore.
     * @param name The symbol name to check
     * @returns True if the name is a rule
     */
    private isRule(name: string): boolean {
        return LarkDocumentAnalyzer.PATTERNS.RULE_REFERENCE.test(name);
    }

    /**
     * Extracts alias definition statements from various types of definition lines.
     * Looks for alias patterns like "expression -> alias_name" within terminal,
     * rule, template rule, and continuation line definitions.
     * @param textLine The line to extract alias definitions from
     * @returns The extracted alias statement or null if none found
     */
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

        return null;
    }

    /**
     * Computes the location (range and URI) of a symbol definition in the document.
     * Creates a VS Code Range object spanning from the start to end of the definition.
     * @param document The VS Code document containing the symbol
     * @param lines The lines that make up the symbol definition
     * @param startIndex The starting line index in the document
     * @param endIndex The ending line index in the document
     * @param startMatcher Optional regex to find the actual start position within the first line
     * @returns A SymbolLocation object with range and URI information
     */
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

    /**
     * Determines the symbol type (terminal, rule, or unknown) based on the symbol name.
     * Uses naming conventions where uppercase names are terminals and lowercase names are rules.
     * @param name The symbol name to analyze
     * @returns The computed symbol type
     */
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

    /**
     * Masks string and regex literals in a line to prevent false positive symbol matches.
     * Replaces characters within string literals ("...") and regex literals (/.../) with asterisks
     * to avoid matching symbol names that appear within literal values.
     * @param line The line to mask literals in
     * @returns The line with literals masked as asterisks
     */
    private maskLiterals(line: string): string {
        const STRING_LITERAL = /(?:"([^"]*)"([imslux]*))/g;
        const REGEX_LITERAL = /(?:(\/[^\/]+\/)([imslux]*))/g;
        const mask = (match: string): string => {
            return match.replace(/./g, '*');
        };

        return line
            .replace(STRING_LITERAL, mask)
            .replace(REGEX_LITERAL, mask);
    }

    /**
     * Escapes special regex characters in a string for safe use in regular expressions.
     * Adds backslashes before characters that have special meaning in regex patterns.
     * @param line The string to escape
     * @returns The escaped string safe for regex usage
     */
    private escapeLiterals(line: string): string {
        return line.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    }
}
