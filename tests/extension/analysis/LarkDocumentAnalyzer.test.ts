import * as assert from 'assert';
import * as vscode from 'vscode';
import { LarkDocumentAnalyzer } from '../../../src/analysis/LarkDocumentAnalyzer';
import { LarkSymbolTable } from '../../../src/analysis/LarkSymbolTable';

suite('LarkDocumentAnalyzer', () => {
    let analyzer: LarkDocumentAnalyzer;
    let symbolTable: LarkSymbolTable;

    setup(() => {
        analyzer = new LarkDocumentAnalyzer();
        symbolTable = new LarkSymbolTable();
    });

    /**
     * Helper function to create a mock TextDocument
     */
    function createMockDocument(
        content: string,
        uri: string = 'test://test.lark'
    ): vscode.TextDocument {
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

    suite('Basic Rule Parsing', () => {
        test('should parse simple rule definition', async () => {
            const content = `
start: hello world
hello: "hello"
world: "world"
            `.trim();

            const document = createMockDocument(content);
            symbolTable = (await analyzer.analyze(document)).symbolTable as LarkSymbolTable;

            // Check that rules were parsed
            const startRule = symbolTable.resolveSymbol('start');
            const helloRule = symbolTable.resolveSymbol('hello');
            const worldRule = symbolTable.resolveSymbol('world');

            assert.ok(startRule, 'start rule should be found');
            assert.ok(helloRule, 'hello rule should be found');
            assert.ok(worldRule, 'world rule should be found');

            assert.strictEqual(startRule.type, 'rule');
            assert.strictEqual(helloRule.type, 'rule');
            assert.strictEqual(worldRule.type, 'rule');
        });

        test('should parse terminal definitions', async () => {
            const content = `
start: HELLO WORLD
HELLO: "hello"
WORLD: "world"
            `.trim();

            const document = createMockDocument(content);
            symbolTable = (await analyzer.analyze(document)).symbolTable as LarkSymbolTable;

            // Check that terminals were parsed
            const helloTerminal = symbolTable.resolveSymbol('HELLO');
            const worldTerminal = symbolTable.resolveSymbol('WORLD');

            assert.ok(helloTerminal, 'HELLO terminal should be found');
            assert.ok(worldTerminal, 'WORLD terminal should be found');

            assert.strictEqual(helloTerminal.type, 'terminal');
            assert.strictEqual(worldTerminal.type, 'terminal');
        });

        test('should parse template rules', async () => {
            const content = `
list{item}: item ("," item)*
item: WORD
WORD: /\\w+/
            `.trim();

            const document = createMockDocument(content);
            symbolTable = (await analyzer.analyze(document)).symbolTable as LarkSymbolTable;

            // Check that template rule was parsed
            const listRule = symbolTable.resolveSymbol('list');

            assert.ok(listRule, 'list rule should be found');
            assert.strictEqual(listRule.type, 'rule');
            assert.strictEqual(listRule.isTemplate, true);
            assert.strictEqual(listRule.baseRuleName, 'list');
            assert.ok(listRule.parameters, 'parameters should be defined');
            assert.strictEqual(listRule.parameters.length, 1);
            assert.strictEqual(listRule.parameters[0].name, 'item');
        });
    });

    suite('Multi-line Rule Parsing', () => {
        test('should parse multi-line rule with alternatives', async () => {
            const content = `
expr: expr "+" term
    | expr "-" term
    | term

term: term "*" factor
    | term "/" factor
    | factor

factor: NUMBER
      | "(" expr ")"

NUMBER: /\\d+/
            `.trim();

            const document = createMockDocument(content);
            symbolTable = (await analyzer.analyze(document)).symbolTable as LarkSymbolTable;

            // Check that all rules were parsed
            const exprRule = symbolTable.resolveSymbol('expr');
            const termRule = symbolTable.resolveSymbol('term');
            const factorRule = symbolTable.resolveSymbol('factor');
            const numberTerminal = symbolTable.resolveSymbol('NUMBER');

            assert.ok(exprRule, 'expr rule should be found');
            assert.ok(termRule, 'term rule should be found');
            assert.ok(factorRule, 'factor rule should be found');
            assert.ok(numberTerminal, 'NUMBER terminal should be found');

            assert.strictEqual(exprRule.type, 'rule');
            assert.strictEqual(termRule.type, 'rule');
            assert.strictEqual(factorRule.type, 'rule');
            assert.strictEqual(numberTerminal.type, 'terminal');
        });
    });

    suite('Import Statement Parsing', () => {
        test('should parse import statements', async () => {
            const content = `
%import common.WORD
%import common.NUMBER -> NUM
%import json.value -> json_value

start: WORD NUM json_value
            `.trim();

            const document = createMockDocument(content);
            symbolTable = (await analyzer.analyze(document)).symbolTable as LarkSymbolTable;

            const wordImport = symbolTable.resolveSymbol('WORD');
            assert.ok(wordImport, 'WORD import should be found');
            assert.strictEqual(wordImport.isImported, true);
            assert.strictEqual(wordImport.importSource, 'common');

            const numImport = symbolTable.resolveSymbol('NUM');
            assert.ok(numImport, 'NUM import should be found');
            assert.strictEqual(numImport.isImported, true);
            assert.strictEqual(numImport.importSource, 'common');
            assert.strictEqual(numImport.originalName, 'NUMBER');

            const jsonImport = symbolTable.resolveSymbol('json_value');
            assert.ok(jsonImport, 'json_value import should be found');
            assert.strictEqual(jsonImport.isImported, true);
            assert.strictEqual(jsonImport.importSource, 'json');
            assert.strictEqual(jsonImport.originalName, 'value');
        });
    });

    suite('Symbol Usage Tracking', () => {
        test('should track symbol usage', async () => {
            const content = `
start: hello world
hello: "hello"
world: "world"
unused: "unused"
            `.trim();

            const document = createMockDocument(content);
            symbolTable = (await analyzer.analyze(document)).symbolTable as LarkSymbolTable;

            // Check usage tracking
            const helloRule = symbolTable.resolveSymbol('hello');
            const worldRule = symbolTable.resolveSymbol('world');
            const unusedRule = symbolTable.resolveSymbol('unused');

            assert.ok(helloRule, 'hello rule should be found');
            assert.ok(worldRule, 'world rule should be found');
            assert.ok(unusedRule, 'unused rule should be found');

            assert.strictEqual(helloRule.isUsed, true, 'hello should be marked as used');
            assert.strictEqual(worldRule.isUsed, true, 'world should be marked as used');
            assert.strictEqual(unusedRule.isUsed, false, 'unused should not be marked as used');

            // Check usage locations
            assert.ok(helloRule.usages.length > 0, 'hello should have usage locations');
            assert.ok(worldRule.usages.length > 0, 'world should have usage locations');
            assert.strictEqual(
                unusedRule.usages.length,
                0,
                'unused should have no usage locations'
            );
        });

        test('should track template rule usage', async () => {
            const content = `
start: list{WORD}
list{item}: item ("," item)*
WORD: /\\w+/
            `.trim();

            const document = createMockDocument(content);
            symbolTable = (await analyzer.analyze(document)).symbolTable as LarkSymbolTable;

            // Check that template rule usage is tracked
            const listRule = symbolTable.resolveSymbol('list');

            assert.ok(listRule, 'list rule should be found');
            assert.strictEqual(listRule.isUsed, true, 'list should be marked as used');
            assert.ok(listRule.usages.length > 0, 'list should have usage locations');
        });
    });

    suite('Comment Handling', () => {
        test('should ignore comments in parsing', async () => {
            const content = `
// This is a comment
start: hello world  // End of line comment
hello: "hello"  /* Block comment */
/* Multi-line
   comment */
world: "world"
            `.trim();

            const document = createMockDocument(content);
            symbolTable = (await analyzer.analyze(document)).symbolTable as LarkSymbolTable;

            // Check that rules were parsed correctly despite comments
            const startRule = symbolTable.resolveSymbol('start');
            const helloRule = symbolTable.resolveSymbol('hello');
            const worldRule = symbolTable.resolveSymbol('world');

            assert.ok(startRule, 'start rule should be found');
            assert.ok(helloRule, 'hello rule should be found');
            assert.ok(worldRule, 'world rule should be found');
        });
    });

    suite('Error Handling', () => {
        test('should handle empty document', async () => {
            const content = '';
            const document = createMockDocument(content);

            // Should not throw
            symbolTable = (await analyzer.analyze(document)).symbolTable as LarkSymbolTable;

            // Global scope should still exist
            const globalScope = symbolTable.getGlobalScope();
            assert.ok(globalScope, 'global scope should exist');
        });

        test('should handle document with only comments', async () => {
            const content = `
// Just comments
/* More comments */
// Nothing else
            `.trim();

            const document = createMockDocument(content);

            // Should not throw
            symbolTable = (await analyzer.analyze(document)).symbolTable as LarkSymbolTable;

            // Should have no symbols
            const allSymbols = symbolTable.getAllSymbols();
            assert.strictEqual(allSymbols.length, 0, 'should have no symbols');
        });
    });

    suite('Document Updates', () => {
        test('should handle document clearing', async () => {
            const content = `
start: hello
hello: "hello"
            `.trim();

            const document = createMockDocument(content);
            symbolTable = (await analyzer.analyze(document)).symbolTable as LarkSymbolTable;

            // Verify symbols exist
            assert.ok(symbolTable.resolveSymbol('start'), 'start should exist');
            assert.ok(symbolTable.resolveSymbol('hello'), 'hello should exist');

            // With stateless analyzer, we just create a new symbol table for clearing
            symbolTable = new LarkSymbolTable();

            // Verify symbols are cleared
            assert.strictEqual(symbolTable.resolveSymbol('start'), null, 'start should be cleared');
            assert.strictEqual(symbolTable.resolveSymbol('hello'), null, 'hello should be cleared');
        });

        test('should handle incremental analysis', async () => {
            const content = `
start: hello
hello: "hello"
            `.trim();

            const document = createMockDocument(content);
            symbolTable = (await analyzer.analyze(document)).symbolTable as LarkSymbolTable;

            // Simulate document changes by re-analyzing with updated content
            const updatedContent = `
start: hello
hello: "hello"
new_rule: "new"
            `.trim();

            const updatedDocument = createMockDocument(updatedContent);

            // Should not throw - with stateless analyzer, this is just a re-analysis
            symbolTable = (await analyzer.analyze(updatedDocument)).symbolTable as LarkSymbolTable;

            // Verify existing symbols still exist and new symbol was added
            assert.ok(symbolTable.resolveSymbol('start'), 'start should still exist');
            assert.ok(symbolTable.resolveSymbol('hello'), 'hello should still exist');
            assert.ok(symbolTable.resolveSymbol('new_rule'), 'new_rule should exist');
        });
    });

    suite('Ignore Directive Tests', () => {
        test('should not flag symbols used in %ignore as unused', async () => {
            const content = `
// A bunch of words
start: word+

// Allow optional punctuation after each word
word: WORD ["," | "!"]

// imports WORD from library
%import _common.WORD
%import _common.WS_INLINE

// Disregard spaces in text
%ignore WS_INLINE
            `.trim();

            const document = createMockDocument(content);
            symbolTable = (await analyzer.analyze(document)).symbolTable as LarkSymbolTable;

            // Check that WS_INLINE is imported and marked as used (due to %ignore)
            const wsInline = symbolTable.resolveSymbol('WS_INLINE');
            assert.ok(wsInline, 'WS_INLINE should be found');
            assert.strictEqual(
                wsInline.isUsed,
                true,
                'WS_INLINE should be marked as used due to %ignore directive'
            );

            // Check that it's not in the unused symbols list
            const unusedSymbols = symbolTable.getUnusedSymbols();
            assert.ok(
                !unusedSymbols.includes('WS_INLINE'),
                'WS_INLINE should not be in unused symbols'
            );
        });
    });
});
