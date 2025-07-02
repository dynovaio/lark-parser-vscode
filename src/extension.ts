import * as vscode from 'vscode';
import { LarkSymbolProvider } from '@/providers/DocumentSymbolProvider';
import { LarkValidator } from '@/analysis/LarkValidator';
import { LarkSymbolTable } from '@/analysis/LarkSymbolTable';
import { LarkDocumentAnalyzer } from '@/analysis/LarkDocumentAnalyzer';

function activate(context: vscode.ExtensionContext) {
    const selector = { language: 'lark', scheme: 'file' };

    // Core analysis components
    const symbolTable = new LarkSymbolTable();
    const analyzer = new LarkDocumentAnalyzer(symbolTable);

    // Connect analyzer to symbol table (for updateFromDocument calls)
    symbolTable.setAnalyzer(analyzer);

    // Core providers
    const symbolProvider = new LarkSymbolProvider();
    const validator = new LarkValidator();

    // Connect symbol table to providers
    symbolProvider.setSymbolTable(symbolTable);
    validator.setSymbolTable(symbolTable);

    // Register Document Symbol Provider
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider)
    );

    // Register Diagnostics
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('lark-diagnostics');
    context.subscriptions.push(diagnosticCollection);

    // TODO: Register additional providers as you implement them
    // context.subscriptions.push(
    //     vscode.languages.registerCompletionItemProvider(selector, new LarkCompletionProvider(), ...),
    //     vscode.languages.registerHoverProvider(selector, new LarkHoverProvider()),
    //     vscode.languages.registerDefinitionProvider(selector, new LarkDefinitionProvider()),
    //     vscode.languages.registerReferenceProvider(selector, new LarkReferenceProvider()),
    // );

    // Document validation setup
    setupDocumentValidation(validator, diagnosticCollection);
}

function setupDocumentValidation(validator: LarkValidator, diagnosticCollection: vscode.DiagnosticCollection) {
    // Validate currently open Lark document
    if (vscode.window.activeTextEditor) {
        const doc = vscode.window.activeTextEditor.document;
        if (doc.languageId === 'lark') { validator.validateTextDocument(doc, diagnosticCollection); }
    }

    // Re-validate on change, open, close
    vscode.workspace.onDidChangeTextDocument(e => validator.validateTextDocument(e.document, diagnosticCollection));
    vscode.workspace.onDidOpenTextDocument(doc => validator.validateTextDocument(doc, diagnosticCollection));
    vscode.workspace.onDidCloseTextDocument(doc => diagnosticCollection.delete(doc.uri));
}

function deactivate() { }

module.exports = { activate, deactivate };
