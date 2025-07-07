import * as assert from 'assert';
import * as vscode from 'vscode';
import { LarkScope, ScopeTypes } from '../../../src/analysis/LarkScope';
import type { SymbolTableEntry, ParameterInfo } from '../../../src/analysis/types.d';

suite('LarkScope', () => {
    let globalScope: LarkScope;
    let ruleScope: LarkScope;

    setup(() => {
        const globalRange = new vscode.Range(0, 0, 10, 0);
        globalScope = new LarkScope(ScopeTypes.GLOBAL, globalRange);

        const ruleRange = new vscode.Range(2, 0, 5, 0);
        ruleScope = new LarkScope(ScopeTypes.RULE, ruleRange, 'test_rule', globalScope);
    });

    function createMockSymbolEntry(name: string, type: 'rule' | 'terminal'): SymbolTableEntry {
        return {
            name,
            type,
            location: {
                range: new vscode.Range(0, 0, 0, name.length),
                uri: vscode.Uri.file('/test.lark')
            },
            usages: [],
            scope: globalScope,
            isUsed: false,
            isDefined: true,
            priority: 0,
            body: ''
        };
    }

    suite('Scope Creation', () => {
        test('should create global scope', () => {
            assert.strictEqual(globalScope.type, ScopeTypes.GLOBAL);
            assert.strictEqual(globalScope.name, undefined);
            assert.strictEqual(globalScope.parent, undefined);
            assert.ok(globalScope.symbols instanceof Map);
            assert.strictEqual(globalScope.parameters, undefined);
        });

        test('should create rule scope with parent', () => {
            assert.strictEqual(ruleScope.type, ScopeTypes.RULE);
            assert.strictEqual(ruleScope.name, 'test_rule');
            assert.strictEqual(ruleScope.parent, globalScope);
            assert.ok(ruleScope.symbols instanceof Map);
            assert.ok(ruleScope.parameters instanceof Map);
        });
    });

    suite('Symbol Management', () => {
        test('should add symbol to scope', () => {
            const symbol = createMockSymbolEntry('test_symbol', 'rule');
            globalScope.addSymbol(symbol);

            assert.strictEqual(globalScope.symbols.size, 1);
            assert.strictEqual(globalScope.symbols.get('test_symbol'), symbol);
            assert.strictEqual(symbol.scope, globalScope);
        });

        test('should get local symbols', () => {
            const symbol1 = createMockSymbolEntry('symbol1', 'rule');
            const symbol2 = createMockSymbolEntry('symbol2', 'terminal');

            globalScope.addSymbol(symbol1);
            globalScope.addSymbol(symbol2);

            const localSymbols = globalScope.getLocalSymbols();
            assert.strictEqual(localSymbols.length, 2);
            assert.ok(localSymbols.includes(symbol1));
            assert.ok(localSymbols.includes(symbol2));
        });
    });

    suite('Symbol Resolution', () => {
        test('should resolve local symbol', () => {
            const symbol = createMockSymbolEntry('local_symbol', 'rule');
            globalScope.addSymbol(symbol);

            const resolved = globalScope.resolveSymbol('local_symbol');
            assert.strictEqual(resolved, symbol);
        });

        test('should resolve symbol from parent scope', () => {
            const globalSymbol = createMockSymbolEntry('global_symbol', 'rule');
            globalScope.addSymbol(globalSymbol);

            const resolved = ruleScope.resolveSymbol('global_symbol');
            assert.strictEqual(resolved, globalSymbol);
        });

        test('should prefer local symbol over parent symbol', () => {
            const globalSymbol = createMockSymbolEntry('shared_name', 'rule');
            const localSymbol = createMockSymbolEntry('shared_name', 'terminal');

            globalScope.addSymbol(globalSymbol);
            ruleScope.addSymbol(localSymbol);

            const resolved = ruleScope.resolveSymbol('shared_name');
            assert.strictEqual(resolved, localSymbol);
        });

        test('should return null for non-existent symbol', () => {
            const resolved = globalScope.resolveSymbol('non_existent');
            assert.strictEqual(resolved, null);
        });
    });

    suite('Parameter Management', () => {
        test('should add parameter to rule scope', () => {
            const parameter: ParameterInfo = {
                name: 'param1',
                position: 0,
                range: new vscode.Range(2, 5, 2, 11)
            };

            ruleScope.addParameter(parameter);

            assert.strictEqual(ruleScope.parameters?.size, 1);
            assert.strictEqual(ruleScope.parameters?.get('param1'), parameter);
        });

        test('should check if parameter is defined', () => {
            const parameter: ParameterInfo = {
                name: 'param1',
                position: 0,
                range: new vscode.Range(2, 5, 2, 11)
            };

            ruleScope.addParameter(parameter);

            assert.strictEqual(ruleScope.isParameterDefined('param1'), true);
            assert.strictEqual(ruleScope.isParameterDefined('non_existent'), false);
        });

        test('should get parameter info', () => {
            const parameter: ParameterInfo = {
                name: 'param1',
                position: 0,
                range: new vscode.Range(2, 5, 2, 11)
            };

            ruleScope.addParameter(parameter);

            const retrieved = ruleScope.getParameterInfo('param1');
            assert.strictEqual(retrieved, parameter);

            const nonExistent = ruleScope.getParameterInfo('non_existent');
            assert.strictEqual(nonExistent, null);
        });

        test('should get all parameters', () => {
            const param1: ParameterInfo = {
                name: 'param1',
                position: 0,
                range: new vscode.Range(2, 5, 2, 11)
            };

            const param2: ParameterInfo = {
                name: 'param2',
                position: 1,
                range: new vscode.Range(2, 13, 2, 19)
            };

            ruleScope.addParameter(param1);
            ruleScope.addParameter(param2);

            const allParams = ruleScope.getParameters();
            assert.strictEqual(allParams.length, 2);
            assert.ok(allParams.includes(param1));
            assert.ok(allParams.includes(param2));
        });

        test('should throw error when adding parameter to global scope', () => {
            const parameter: ParameterInfo = {
                name: 'param1',
                position: 0,
                range: new vscode.Range(2, 5, 2, 11)
            };

            assert.throws(() => {
                globalScope.addParameter(parameter);
            }, /Parameters can only be added to rule scopes/);
        });

        test('should return empty array for parameters in global scope', () => {
            const params = globalScope.getParameters();
            assert.strictEqual(params.length, 0);
        });

        test('should return false for parameter checks in global scope', () => {
            assert.strictEqual(globalScope.isParameterDefined('any_param'), false);
        });

        test('should return null for parameter info in global scope', () => {
            const paramInfo = globalScope.getParameterInfo('any_param');
            assert.strictEqual(paramInfo, null);
        });
    });

    suite('Position Containment', () => {
        test('should contain position within range', () => {
            const position = new vscode.Position(3, 5);
            assert.strictEqual(ruleScope.containsPosition(position), true);
        });

        test('should not contain position outside range', () => {
            const position = new vscode.Position(8, 5);
            assert.strictEqual(ruleScope.containsPosition(position), false);
        });

        test('should contain position at start of range', () => {
            const position = new vscode.Position(2, 0);
            assert.strictEqual(ruleScope.containsPosition(position), true);
        });

        test('should contain position at end of range', () => {
            const position = new vscode.Position(5, 0);
            assert.strictEqual(ruleScope.containsPosition(position), true);
        });
    });

    suite('String Representation', () => {
        test('should create string representation for global scope', () => {
            const str = globalScope.toString();
            assert.ok(str.includes('globalScope'));
            assert.ok(str.includes('symbols: 0'));
            assert.ok(str.includes('params: 0'));
        });

        test('should create string representation for named rule scope', () => {
            const str = ruleScope.toString();
            assert.ok(str.includes('ruleScope'));
            assert.ok(str.includes('test_rule'));
            assert.ok(str.includes('symbols: 0'));
            assert.ok(str.includes('params: 0'));
        });

        test('should show symbol and parameter counts', () => {
            const symbol = createMockSymbolEntry('test_symbol', 'rule');
            const parameter: ParameterInfo = {
                name: 'param1',
                position: 0,
                range: new vscode.Range(2, 5, 2, 11)
            };

            ruleScope.addSymbol(symbol);
            ruleScope.addParameter(parameter);

            const str = ruleScope.toString();
            assert.ok(str.includes('symbols: 1'));
            assert.ok(str.includes('params: 1'));
        });
    });
});
