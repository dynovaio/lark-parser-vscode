import * as assert from 'assert';
import * as vscode from 'vscode';
import { LarkDocumentAnalyzer } from '../../../src/analysis/LarkDocumentAnalyzer';
import { LarkSymbolTable } from '../../../src/analysis/LarkSymbolTable';

suite('LarkDocumentAnalyzer Debug', () => {
    let analyzer: LarkDocumentAnalyzer;
    let symbolTable: LarkSymbolTable;

    setup(() => {
        analyzer = new LarkDocumentAnalyzer();
        symbolTable = new LarkSymbolTable();
    });

    /**
     * Helper function to create a mock TextDocument
     */
    function createMockDocument(content: string, uri: string = 'test://test.lark'): vscode.TextDocument {
        const lines = content.split('\n');
        const mockUri = vscode.Uri.parse(uri);
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
                return content;
            },
            getWordRangeAtPosition: () => undefined,
            validateRange: (range: vscode.Range) => range,
            validatePosition: (position: vscode.Position) => position,
            get lineCount() {
                return lines.length;
            },
            lineAt: (line: number | vscode.Position) => {
                const lineNum = typeof line === 'number' ? line : line.line;
                const lineText = lines[lineNum] || '';
                return {
                    lineNumber: lineNum,
                    text: lineText,
                    range: new vscode.Range(lineNum, 0, lineNum, lineText.length),
                    rangeIncludingLineBreak: new vscode.Range(lineNum, 0, lineNum + 1, 0),
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
            get eol() {
                return vscode.EndOfLine.LF;
            }
        };
    }

    test('should debug symbol usage tracking', async () => {
        const content = `
start: hello world
hello: "hello"
world: "world"
unused: "unused"
        `.trim();

        const document = createMockDocument(content);
        symbolTable = await analyzer.analyze(document);

        console.log('=== All symbols ===');
        const allSymbols = symbolTable.getAllSymbols();
        for (const symbol of allSymbols) {
            console.log(`${symbol.name} (${symbol.type}): isUsed=${symbol.isUsed}, usages=${symbol.usages.length}`);
            if (symbol.usages.length > 0) {
                console.log(`  Usage locations:`);
                for (const usage of symbol.usages) {
                    console.log(`    Line ${usage.range.start.line}, chars ${usage.range.start.character}-${usage.range.end.character}`);
                }
            }
        }

        console.log('=== Unused symbols ===');
        const unusedSymbols = symbolTable.getUnusedSymbols();
        console.log(unusedSymbols);

        // Basic assertions
        const helloRule = symbolTable.resolveSymbol('hello');
        const worldRule = symbolTable.resolveSymbol('world');
        const unusedRule = symbolTable.resolveSymbol('unused');

        assert.ok(helloRule, 'hello rule should be found');
        assert.ok(worldRule, 'world rule should be found');
        assert.ok(unusedRule, 'unused rule should be found');

        assert.strictEqual(helloRule.isUsed, true, 'hello should be marked as used');
        assert.strictEqual(worldRule.isUsed, true, 'world should be marked as used');
        assert.strictEqual(unusedRule.isUsed, false, 'unused should not be marked as used');
    });
});
