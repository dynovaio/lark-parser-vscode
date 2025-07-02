import * as vscode from 'vscode';
import { LarkDocumentAnalyzer } from '../analysis/LarkDocumentAnalyzer';
import { LarkSymbolTable } from '../analysis/LarkSymbolTable';
import { LarkValidator } from '../analysis/LarkValidator';

export class LarkDocumentManager {
    private symbolTable: LarkSymbolTable;
    private analyzer: LarkDocumentAnalyzer;
    private validator: LarkValidator;
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor (context: vscode.ExtensionContext) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('lark-diagnostics');
        // These will be properly wired up in the next steps
        this.symbolTable = new LarkSymbolTable();
        this.analyzer = new LarkDocumentAnalyzer(this.symbolTable); // Temporary, will be decoupled
        this.validator = new LarkValidator(); // Temporary, will be decoupled

        context.subscriptions.push(this.diagnosticCollection);
    }

    public listen() {
        // Register event listeners that will eventually call handleDocumentChange
        vscode.workspace.onDidOpenTextDocument(doc => this.handleDocumentChange(doc));
        vscode.workspace.onDidChangeTextDocument(e => this.handleDocumentChange(e.document));
        vscode.workspace.onDidCloseTextDocument(doc => this.diagnosticCollection.delete(doc.uri));

        // Handle the initially active document
        if (vscode.window.activeTextEditor) {
            this.handleDocumentChange(vscode.window.activeTextEditor.document);
        }
    }

    private handleDocumentChange(document: vscode.TextDocument) {
        if (document.languageId !== 'lark') {
            return;
        }
        // Core orchestration logic will be implemented here in a later step.
        // For now, this method is just a placeholder.
    }

    public getSymbolTable(): LarkSymbolTable {
        return this.symbolTable;
    }
}
