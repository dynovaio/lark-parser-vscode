import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LarkDocumentAnalyzer } from '../../../src/analysis/LarkDocumentAnalyzer';
import { LarkSymbolTable } from '../../../src/analysis/LarkSymbolTable';

suite('LarkDocumentAnalyzer Integration', () => {
    let analyzer: LarkDocumentAnalyzer;
    let symbolTable: LarkSymbolTable;

    setup(() => {
        analyzer = new LarkDocumentAnalyzer();
        symbolTable = new LarkSymbolTable();
    });

    /**
     * Helper function to load a test grammar file
     */
    function loadTestGrammar(filename: string): string {
        const testGrammarsPath = path.join(process.cwd(), 'tests', 'syntaxes');
        const filePath = path.join(testGrammarsPath, filename);
        return fs.readFileSync(filePath, 'utf-8');
    }

    /**
     * Helper function to create a TextDocument from content
     */
    function createDocument(content: string, uri: string = 'test://test.lark'): vscode.TextDocument {
        const mockUri = vscode.Uri.parse(uri);
        const lines = content.split('\n');

        return {
            uri: mockUri,
            fileName: mockUri.fsPath,
            isUntitled: false,
            languageId: 'lark',
            version: 1,
            isDirty: false,
            isClosed: false,
            encoding: 'utf8',
            save: () => Promise.resolve(true),
            getText: (range?: vscode.Range) => {
                if (!range) {
                    return content;
                }
                const startLine = range.start.line;
                const endLine = range.end.line;
                const startChar = range.start.character;
                const endChar = range.end.character;

                if (startLine === endLine) {
                    return lines[startLine]?.substring(startChar, endChar) || '';
                }

                let result = lines[startLine]?.substring(startChar) || '';
                for (let i = startLine + 1; i < endLine; i++) {
                    result += '\n' + (lines[i] || '');
                }
                if (endLine < lines.length) {
                    result += '\n' + (lines[endLine]?.substring(0, endChar) || '');
                }
                return result;
            },
            lineAt: (line: number | vscode.Position) => {
                const lineNumber = typeof line === 'number' ? line : line.line;
                const lineText = lines[lineNumber] || '';
                return {
                    lineNumber,
                    text: lineText,
                    range: new vscode.Range(lineNumber, 0, lineNumber, lineText.length),
                    rangeIncludingLineBreak: new vscode.Range(lineNumber, 0, lineNumber + 1, 0),
                    firstNonWhitespaceCharacterIndex: lineText.search(/\S/),
                    isEmptyOrWhitespace: lineText.trim() === ''
                };
            },
            offsetAt: (position: vscode.Position) => {
                let offset = 0;
                for (let i = 0; i < position.line && i < lines.length; i++) {
                    offset += lines[i].length + 1; // +1 for newline
                }
                return offset + position.character;
            },
            positionAt: (offset: number) => {
                let currentOffset = 0;
                for (let line = 0; line < lines.length; line++) {
                    const lineLength = lines[line].length;
                    if (currentOffset + lineLength >= offset) {
                        return new vscode.Position(line, offset - currentOffset);
                    }
                    currentOffset += lineLength + 1; // +1 for newline
                }
                return new vscode.Position(lines.length - 1, lines[lines.length - 1]?.length || 0);
            },
            getWordRangeAtPosition: (position: vscode.Position, regex?: RegExp) => {
                const line = lines[position.line];
                if (!line) {
                    return undefined;
                }

                const wordRegex = regex || /\w+/;
                const match = line.substring(0, position.character).match(wordRegex);
                if (!match) {
                    return undefined;
                }

                const start = position.character - match[0].length;
                const end = position.character;
                return new vscode.Range(position.line, start, position.line, end);
            },
            validateRange: (range: vscode.Range) => range,
            validatePosition: (position: vscode.Position) => position,
            get lineCount() {
                return lines.length;
            },
            get eol() {
                return vscode.EndOfLine.LF;
            }
        };
    }

    test('should parse calculator grammar', async () => {
        try {
            const content = loadTestGrammar('calc.test.lark');
            const document = createDocument(content, 'test://calc.lark');

            symbolTable = await analyzer.analyze(document);

            // Should have found some symbols
            const allSymbols = symbolTable.getAllSymbols();
            assert.ok(allSymbols.length > 0, 'should find symbols in calculator grammar');

            // Should have start rule (common in most grammars)
            const startRule = symbolTable.resolveSymbol('start');
            if (startRule) {
                assert.strictEqual(startRule.type, 'rule', 'start should be a rule');
            }

            console.log(`Parsed ${allSymbols.length} symbols from calculator grammar`);
            console.log('Symbol types:', allSymbols.reduce((acc, s) => {
                acc[s.type] = (acc[s.type] || 0) + 1;
                return acc;
            }, {} as Record<string, number>));

        } catch (error) {
            // If test file doesn't exist, skip this test
            if ((error as any).code === 'ENOENT') {
                console.log('Calculator test grammar not found, skipping test');
                return;
            }
            throw error;
        }
    });

    test('should parse JSON grammar', async () => {
        try {
            const content = loadTestGrammar('json.test.lark');
            const document = createDocument(content, 'test://json.lark');

            symbolTable = await analyzer.analyze(document);

            // Should have found some symbols
            const allSymbols = symbolTable.getAllSymbols();
            assert.ok(allSymbols.length > 0, 'should find symbols in JSON grammar');

            // Look for common JSON structures
            const valueRule = symbolTable.resolveSymbol('value');
            if (valueRule) {
                assert.strictEqual(valueRule.type, 'rule', 'value should be a rule');
            }

            console.log(`Parsed ${allSymbols.length} symbols from JSON grammar`);

        } catch (error) {
            // If test file doesn't exist, skip this test
            if ((error as any).code === 'ENOENT') {
                console.log('JSON test grammar not found, skipping test');
                return;
            }
            throw error;
        }
    });

    test('should handle complex grammar with imports and parameterized rules', async () => {
        const content = `
// Complex grammar demonstrating various Lark features
%import common.WORD
%import common.NUMBER -> NUM

start: statement+

statement: assignment
         | expression

assignment: WORD "=" expression

expression: expression "+" term
          | expression "-" term
          | term

term: term "*" factor
    | term "/" factor
    | factor

factor: NUM
      | WORD
      | "(" expression ")"
      | list{NUM}
      | list{expression}

list{item}: "[" [item ("," item)*] "]"

// Some unused rules to test unused symbol detection
unused_rule: "never_used"
another_unused: WORD "unused"

%ignore /\\s+/
        `.trim();

        const document = createDocument(content, 'test://complex.lark');
        symbolTable = await analyzer.analyze(document);

        // Check imports
        const wordImport = symbolTable.resolveSymbol('WORD');
        const numImport = symbolTable.resolveSymbol('NUM');

        assert.ok(wordImport, 'WORD import should be found');
        assert.ok(numImport, 'NUM import should be found');
        assert.strictEqual(wordImport.isImported, true);
        assert.strictEqual(numImport.isImported, true);
        assert.strictEqual(numImport.originalName, 'NUMBER');

        // Check parameterized rules
        const listRule = symbolTable.resolveSymbol('list');
        assert.ok(listRule, 'list rule should be found');
        assert.strictEqual(listRule.isTemplated, true);
        assert.ok(listRule.parameters, 'list should have parameters');
        assert.strictEqual(listRule.parameters.length, 1);
        assert.strictEqual(listRule.parameters[0].name, 'item');

        // Check usage tracking
        const startRule = symbolTable.resolveSymbol('start');
        const expressionRule = symbolTable.resolveSymbol('expression');
        const unusedRule = symbolTable.resolveSymbol('unused_rule');

        assert.ok(startRule, 'start rule should be found');
        assert.ok(expressionRule, 'expression rule should be found');
        assert.ok(unusedRule, 'unused_rule should be found');

        // expression should be used (referenced in multiple places)
        assert.ok(expressionRule.usages.length > 0, 'expression should have usages');

        // unused_rule should not be used
        assert.strictEqual(unusedRule.isUsed, false, 'unused_rule should not be marked as used');

        // Get unused symbols
        const unusedSymbols = symbolTable.getUnusedSymbols();
        assert.ok(unusedSymbols.includes('unused_rule'), 'unused_rule should be in unused symbols');
        assert.ok(unusedSymbols.includes('another_unused'), 'another_unused should be in unused symbols');

        console.log('Unused symbols:', unusedSymbols);

        // Get all symbols by type
        const allSymbols = symbolTable.getAllSymbols();
        const symbolsByType = allSymbols.reduce((acc, s) => {
            acc[s.type] = (acc[s.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        console.log('Symbol distribution:', symbolsByType);
        assert.ok(symbolsByType.rule > 0, 'should have rules');
        assert.ok(symbolsByType.terminal > 0, 'should have terminal symbols');

        const symbolsByOrigin = allSymbols.reduce((acc, s) => {
            acc[s.isImported ? 'imported' : 'local'] = (acc[s.isImported ? 'imported' : 'local'] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        console.log('Symbols by origin:', symbolsByOrigin);
        assert.ok(symbolsByOrigin.local > 0, 'should have local symbols');
        assert.ok(symbolsByOrigin.imported > 0, 'should have imported symbols');
    });

    test('should provide document symbols for VS Code outline', async () => {
        const content = `
start: expression

expression: term ("+" term)*

term: factor ("*" factor)*

factor: NUMBER
      | "(" expression ")"

NUMBER: /\\d+/
        `.trim();

        const document = createDocument(content, 'test://outline.lark');
        symbolTable = await analyzer.analyze(document);

        const documentSymbols = symbolTable.getDocumentSymbols();
        assert.ok(documentSymbols.length > 0, 'should provide document symbols');

        // Check that we have both rules and terminals
        const symbolNames = documentSymbols.map(s => s.name);
        assert.ok(symbolNames.includes('start'), 'should include start rule');
        assert.ok(symbolNames.includes('expression'), 'should include expression rule');
        assert.ok(symbolNames.includes('NUMBER'), 'should include NUMBER terminal');

        console.log('Document symbols:', symbolNames);
    });
});
