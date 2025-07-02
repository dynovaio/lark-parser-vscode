import * as vscode from 'vscode';
import { LarkDocumentAnalyzer } from '../analysis/LarkDocumentAnalyzer';
import { LarkSymbolTable } from '../analysis/LarkSymbolTable';
import { LarkValidator } from '../analysis/LarkValidator';

export class LarkDocumentManager {
    private documentSymbolTables: Map<string, LarkSymbolTable>;
    private analyzer: LarkDocumentAnalyzer;
    private validator: LarkValidator;
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor (context: vscode.ExtensionContext) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('lark-diagnostics');
        this.documentSymbolTables = new Map<string, LarkSymbolTable>();
        this.analyzer = new LarkDocumentAnalyzer();
        this.validator = new LarkValidator();

        context.subscriptions.push(this.diagnosticCollection);
    }

    public listen() {
        // Register event listeners that will eventually call handleDocumentChange
        vscode.workspace.onDidOpenTextDocument(doc => this.handleDocumentChange(doc));
        vscode.workspace.onDidChangeTextDocument(e => this.handleDocumentChange(e.document));
        vscode.workspace.onDidCloseTextDocument(doc => {
            this.diagnosticCollection.delete(doc.uri);
            this.documentSymbolTables.delete(doc.uri.toString());
        });

        // Handle the initially active document
        if (vscode.window.activeTextEditor) {
            this.handleDocumentChange(vscode.window.activeTextEditor.document);
        }
    }

    private async handleDocumentChange(document: vscode.TextDocument) {
        if (document.languageId !== 'lark') {
            return;
        }

        // Step 1: Analyze the document to get a new symbol table.
        const symbolTable = await this.analyzer.analyze(document);
        this.documentSymbolTables.set(document.uri.toString(), symbolTable);

        // Step 2: Validate the document using the new symbol table.
        const diagnostics = this.validator.validate(document, symbolTable);
        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    public getSymbolTable(uri: vscode.Uri): LarkSymbolTable | undefined {
        return this.documentSymbolTables.get(uri.toString());
    }
}
