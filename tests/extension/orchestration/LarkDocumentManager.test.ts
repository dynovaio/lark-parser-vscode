import * as assert from 'assert';
import * as vscode from 'vscode';
import { LarkDocumentManager } from '../../../src/orchestration/LarkDocumentManager';

suite('LarkDocumentManager', () => {
    let manager: LarkDocumentManager;
    let mockContext: vscode.ExtensionContext;

    setup(() => {
        // Create a mock extension context
        mockContext = {
            subscriptions: [],
            workspaceState: {} as vscode.Memento,
            globalState: {} as vscode.Memento & { setKeysForSync: (keys: string[]) => void },
            extensionUri: vscode.Uri.file('/test'),
            extensionPath: '/test',
            asAbsolutePath: (relativePath: string) => '/test/' + relativePath,
            storageUri: vscode.Uri.file('/test/storage'),
            storagePath: '/test/storage',
            globalStorageUri: vscode.Uri.file('/test/globalStorage'),
            globalStoragePath: '/test/globalStorage',
            logUri: vscode.Uri.file('/test/log'),
            logPath: '/test/log',
            extensionMode: vscode.ExtensionMode.Test,
            environmentVariableCollection: {} as vscode.GlobalEnvironmentVariableCollection,
            secrets: {} as vscode.SecretStorage,
            extension: {} as vscode.Extension<unknown>,
            languageModelAccessInformation: {} as vscode.LanguageModelAccessInformation
        };

        manager = new LarkDocumentManager(mockContext);
    });

    /**
     * Helper function to create a mock TextDocument
     */
    function createMockDocument(
        content: string,
        uri: string = 'test://test.lark',
        languageId: string = 'lark'
    ): vscode.TextDocument {
        const mockUri = vscode.Uri.parse(uri);
        const lines = content.split('\n');

        return {
            uri: mockUri,
            fileName: mockUri.fsPath,
            isUntitled: false,
            languageId: languageId,
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

    suite('Document Management', () => {
        test('should get symbol table for document', () => {
            const content = `
start: hello
hello: "hello"
            `.trim();

            const document = createMockDocument(content);

            // Initially should return undefined for unknown document
            const initialTable = manager.getSymbolTable(document.uri);
            assert.strictEqual(
                initialTable,
                undefined,
                'should return undefined for unknown document'
            );
        });

        test('should handle multiple documents', () => {
            const content1 = `start: rule1\nrule1: "test1"`;
            const content2 = `start: rule2\nrule2: "test2"`;

            const doc1 = createMockDocument(content1, 'test://doc1.lark');
            const doc2 = createMockDocument(content2, 'test://doc2.lark');

            // Initially both should return undefined
            assert.strictEqual(manager.getSymbolTable(doc1.uri), undefined);
            assert.strictEqual(manager.getSymbolTable(doc2.uri), undefined);
        });
    });

    suite('Non-Lark Documents', () => {
        test('should ignore non-lark documents', () => {
            const content = `console.log("not lark");`;
            const jsDocument = createMockDocument(content, 'test://test.js', 'javascript');

            // Should not process non-lark documents
            const symbolTable = manager.getSymbolTable(jsDocument.uri);
            assert.strictEqual(symbolTable, undefined, 'should not process non-lark documents');
        });
    });
});
