import * as assert from 'assert';
import * as vscode from 'vscode';
import { LarkSymbolTable } from '../../../src/analysis/LarkSymbolTable';
import { LarkScope } from '../../../src/analysis/LarkScope';
import type { SymbolTableEntry, SymbolLocation, ParameterInfo } from '../../../src/analysis/types.d';

suite('LarkSymbolTable', () => {
    let symbolTable: LarkSymbolTable;
    let mockDocumentUri: vscode.Uri;

    setup(() => {
        symbolTable = new LarkSymbolTable();
        mockDocumentUri = vscode.Uri.file('/test/mock.lark');
    });

    suite('Basic Functionality', () => {
        test('should initialize with empty global scope', () => {
            const globalScope = symbolTable.getGlobalScope();
            assert.strictEqual(globalScope.type, 'global');
            assert.strictEqual(globalScope.symbols.size, 0);
        });

        test('should return global scope when no specific scope found', () => {
            const position = new vscode.Position(0, 0);
            const scope = symbolTable.getCurrentScope(position);
            assert.strictEqual(scope.type, 'global');
        });

        test('should return null for non-existent rule scope', () => {
            const ruleScope = symbolTable.getRuleScope('nonexistent');
            assert.strictEqual(ruleScope, null);
        });
    });

    suite('Symbol Management', () => {
        test('should add symbol to global scope', () => {
            const symbolEntry: SymbolTableEntry = createMockSymbolEntry('test_rule', 'rule');

            symbolTable.addSymbol(symbolEntry);

            const resolved = symbolTable.resolveSymbol('test_rule');
            assert.strictEqual(resolved, symbolEntry);
        });

        test('should resolve symbol from global scope', () => {
            const symbolEntry: SymbolTableEntry = createMockSymbolEntry('TEST_TERMINAL', 'terminal');

            symbolTable.addSymbol(symbolEntry);

            const resolved = symbolTable.resolveSymbol('TEST_TERMINAL');
            assert.strictEqual(resolved?.name, 'TEST_TERMINAL');
            assert.strictEqual(resolved?.type, 'terminal');
        });

        test('should return null for non-existent symbol', () => {
            const resolved = symbolTable.resolveSymbol('nonexistent');
            assert.strictEqual(resolved, null);
        });

        test('should mark symbol as used', () => {
            const symbolEntry: SymbolTableEntry = createMockSymbolEntry('test_rule', 'rule');
            symbolEntry.isUsed = false;

            symbolTable.addSymbol(symbolEntry);

            const location: SymbolLocation = {
                range: new vscode.Range(0, 0, 0, 9),
                uri: mockDocumentUri
            };

            symbolTable.markSymbolAsUsed('test_rule', location);

            assert.strictEqual(symbolEntry.isUsed, true);
        });
    });

    suite('Parameterized Rules', () => {
        test('should resolve parameterized rule by base name', () => {
            const symbolEntry: SymbolTableEntry = createMockParameterizedSymbolEntry(
                'comprehension{comp_result}',
                'comprehension'
            );

            symbolTable.addSymbol(symbolEntry);

            const resolved = symbolTable.resolveParameterizedRule('comprehension');
            assert.strictEqual(resolved, symbolEntry);
        });

        test('should resolve exact match before parameterized match', () => {
            const exactEntry: SymbolTableEntry = createMockSymbolEntry('rule_name', 'rule');
            const paramEntry: SymbolTableEntry = createMockParameterizedSymbolEntry(
                'rule_name{param}',
                'rule_name'
            );

            symbolTable.addSymbol(exactEntry);
            symbolTable.addSymbol(paramEntry);

            const resolved = symbolTable.resolveParameterizedRule('rule_name');
            assert.strictEqual(resolved, exactEntry);
        });

        test('should return null for non-existent parameterized rule', () => {
            const resolved = symbolTable.resolveParameterizedRule('nonexistent');
            assert.strictEqual(resolved, null);
        });
    });

    suite('Rule Scopes', () => {
        test('should create rule scope with parameters', () => {
            const parameters: ParameterInfo[] = [
                { name: 'param1', position: 0, range: new vscode.Range(0, 5, 0, 11) },
                { name: 'param2', position: 1, range: new vscode.Range(0, 13, 0, 19) }
            ];
            const range = new vscode.Range(0, 0, 2, 0);

            const ruleScope = symbolTable.createRuleScope('test_rule', range, parameters);

            assert.strictEqual(ruleScope.type, 'rule');
            assert.strictEqual(ruleScope.name, 'test_rule');
            assert.strictEqual(ruleScope.isParameterDefined('param1'), true);
            assert.strictEqual(ruleScope.isParameterDefined('param2'), true);
            assert.strictEqual(ruleScope.isParameterDefined('param3'), false);
        });

        test('should retrieve rule scope by name', () => {
            const range = new vscode.Range(0, 0, 2, 0);
            const ruleScope = symbolTable.createRuleScope('test_rule', range);

            const retrieved = symbolTable.getRuleScope('test_rule');
            assert.strictEqual(retrieved, ruleScope);
        });

        test('should return rule scope for position within rule range', () => {
            const range = new vscode.Range(5, 0, 10, 0);
            symbolTable.createRuleScope('test_rule', range);

            const position = new vscode.Position(7, 5);
            const scope = symbolTable.getCurrentScope(position);

            assert.strictEqual(scope.type, 'rule');
            assert.strictEqual(scope.name, 'test_rule');
        });
    });

    suite('Symbol Definitions Integration', () => {
        test('should return document symbols for VS Code outline', () => {
            const entry1: SymbolTableEntry = createMockSymbolEntry('test_rule', 'rule');
            const entry2: SymbolTableEntry = createMockSymbolEntry('TEST_TERMINAL', 'terminal');

            symbolTable.addSymbol(entry1);
            symbolTable.addSymbol(entry2);

            const docSymbols = symbolTable.getDocumentSymbols();

            assert.strictEqual(docSymbols.length, 2);
            assert.strictEqual(docSymbols[0].name, 'test_rule');
            assert.strictEqual(docSymbols[0].kind, vscode.SymbolKind.Function);
            assert.strictEqual(docSymbols[1].name, 'TEST_TERMINAL');
            assert.strictEqual(docSymbols[1].kind, vscode.SymbolKind.Constant);
        });

        test('should return unused symbols excluding start rule', () => {
            const entry1: SymbolTableEntry = createMockSymbolEntry('start', 'rule');
            const entry2: SymbolTableEntry = createMockSymbolEntry('unused_rule', 'rule');
            const entry3: SymbolTableEntry = createMockSymbolEntry('used_rule', 'rule');

            entry1.isUsed = false; // start rule should be excluded even if unused
            entry2.isUsed = false; // should be included in unused
            entry3.isUsed = true;  // should not be included

            symbolTable.addSymbol(entry1);
            symbolTable.addSymbol(entry2);
            symbolTable.addSymbol(entry3);

            const unusedSymbols = symbolTable.getUnusedSymbols();

            assert.strictEqual(unusedSymbols.length, 1);
            assert.strictEqual(unusedSymbols[0], 'unused_rule');
        });
    });

    // Helper functions
    function createMockSymbolEntry(name: string, type: 'rule' | 'terminal'): SymbolTableEntry {
        const symbolLocation: SymbolLocation = {
            range: new vscode.Range(0, 0, 0, name.length),
            uri: mockDocumentUri
        };

        return {
            name,
            type,
            location: symbolLocation,
            usages: [],
            scope: symbolTable.getGlobalScope(),
            isUsed: false,
            isDefined: true,
            priority: 0,
            body: ''
        };
    }

    function createMockParameterizedSymbolEntry(name: string, baseName: string): SymbolTableEntry {
        const entry = createMockSymbolEntry(name, 'rule');
        entry.isTemplated = true;
        entry.baseRuleName = baseName;
        return entry;
    }

    function createMockTextDocument(): vscode.TextDocument {
        return {
            uri: mockDocumentUri,
            fileName: '/test/mock.lark',
            isUntitled: false,
            languageId: 'lark',
            version: 1,
            isDirty: false,
            isClosed: false,
            lineCount: 10,
            save: () => Promise.resolve(true),
            eol: vscode.EndOfLine.LF,
            encoding: 'utf8',
            getText: () => '// Mock document content',
            lineAt: (line: number | vscode.Position) => {
                const lineNumber = typeof line === 'number' ? line : line.line;
                return {
                    lineNumber: lineNumber,
                    text: '// Mock line content',
                    range: new vscode.Range(lineNumber, 0, lineNumber, 20),
                    rangeIncludingLineBreak: new vscode.Range(lineNumber, 0, lineNumber + 1, 0),
                    firstNonWhitespaceCharacterIndex: 0,
                    isEmptyOrWhitespace: false
                };
            },
            offsetAt: () => 0,
            positionAt: () => new vscode.Position(0, 0),
            getWordRangeAtPosition: () => undefined,
            validateRange: (range) => range,
            validatePosition: (position) => position
        } as vscode.TextDocument;
    }
});
