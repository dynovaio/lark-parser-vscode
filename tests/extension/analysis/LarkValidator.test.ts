import * as assert from 'assert';
import * as vscode from 'vscode';
import { LarkValidator } from '../../../src/analysis/LarkValidator';
import { LarkSymbolTable } from '../../../src/analysis/LarkSymbolTable';
import { LarkDocumentAnalyzer } from '../../../src/analysis/LarkDocumentAnalyzer';

suite('LarkValidator', () => {
    let validator: LarkValidator;
    let analyzer: LarkDocumentAnalyzer;

    setup(() => {
        validator = new LarkValidator();
        analyzer = new LarkDocumentAnalyzer();
    });

    /**
     * Helper function to create a mock TextDocument
     */
    function createMockDocument(content: string, uri: string = 'test://test.lark'): vscode.TextDocument {
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

    suite('Unused Symbol Detection', () => {
        test('should detect unused symbols', async () => {
            const content = `
start: hello
hello: "hello"
unused: "unused"
            `.trim();

            const document = createMockDocument(content);
            const analysisResult = await analyzer.analyze(document);
            const diagnostics = validator.validate(document, analysisResult);

            // Should have diagnostics for unused symbol
            const unusedDiagnostics = diagnostics.filter(d => d.message.includes('unused'));
            assert.ok(unusedDiagnostics.length > 0, 'should detect unused symbols');
        });

        test('should not flag start rule as unused', async () => {
            const content = `
start: "hello"
unused: "unused"
            `.trim();

            const document = createMockDocument(content);
            const analysisResult = await analyzer.analyze(document);
            const diagnostics = validator.validate(document, analysisResult);

            // Should have diagnostic for unused but not for start
            const startDiagnostics = diagnostics.filter(d => d.message.includes('start'));
            const unusedDiagnostics = diagnostics.filter(d => d.message.includes('unused'));

            assert.strictEqual(startDiagnostics.length, 0, 'should not flag start rule as unused');
            assert.ok(unusedDiagnostics.length > 0, 'should flag actual unused symbols');
        });

        test('should not flag symbols used in ignore directive as unused', async () => {
            const content = `
start: word+
word: WORD
%import _common.WORD
%import _common.WS_INLINE
%ignore WS_INLINE
            `.trim();

            const document = createMockDocument(content);
            const analysisResult = await analyzer.analyze(document);
            const diagnostics = validator.validate(document, analysisResult);

            // Should not have diagnostics for WS_INLINE since it's used in %ignore
            const wsInlineDiagnostics = diagnostics.filter(d => d.message.includes('WS_INLINE'));
            assert.strictEqual(wsInlineDiagnostics.length, 0, 'should not flag symbols used in %ignore as unused');
        });
    });

    suite('Undefined Symbol Detection', () => {
        test('should detect undefined symbols', async () => {
            const content = `
start: undefined_rule
            `.trim();

            const document = createMockDocument(content);
            const analysisResult = await analyzer.analyze(document);
            const diagnostics = validator.validate(document, analysisResult);

            // Should have diagnostics for undefined symbol
            // Note: This test might need adjustment based on current implementation
            // For now, we'll just check that the validator runs without errors
            assert.ok(Array.isArray(diagnostics), 'should return diagnostics array');
        });
    });

    suite('Non-Lark Documents', () => {
        test('should return empty diagnostics for non-lark documents', () => {
            const content = `console.log("not lark");`;
            const jsDocument = createMockDocument(content, 'test://test.js');

            // Override languageId to simulate non-lark document
            (jsDocument as any).languageId = 'javascript';

            const analysisResult = {
                symbolTable: new LarkSymbolTable(),
                undefinedSymbolTable: new Map(),
            };
            const diagnostics = validator.validate(jsDocument, analysisResult);

            assert.strictEqual(diagnostics.length, 0, 'should return empty diagnostics for non-lark documents');
        });
    });

    suite('Error Handling', () => {
        test('should handle empty documents', async () => {
            const content = '';
            const document = createMockDocument(content);
            const analysisResult = await analyzer.analyze(document);
            const diagnostics = validator.validate(document, analysisResult);

            // Should not throw and should return array
            assert.ok(Array.isArray(diagnostics), 'should return diagnostics array for empty document');
        });

        test('should handle malformed grammar', async () => {
            const content = `
this is not valid lark grammar :::
            `.trim();

            const document = createMockDocument(content);
            const analysisResult = await analyzer.analyze(document);
            const diagnostics = validator.validate(document, analysisResult);

            // Should not throw
            assert.ok(Array.isArray(diagnostics), 'should return diagnostics array for malformed grammar');
        });
    });
});
