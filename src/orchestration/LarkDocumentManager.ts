import * as vscode from 'vscode';
import { LarkDocumentAnalyzer } from '../analysis/LarkDocumentAnalyzer';
import { LarkSymbolTable } from '../analysis/LarkSymbolTable';
import { LarkValidator } from '../analysis/LarkValidator';
import { AnalysisResult } from '../analysis/types.d';

export class LarkDocumentManager {
    private documentAnalysisResult: Map<string, AnalysisResult>;
    private analyzer: LarkDocumentAnalyzer;
    private validator: LarkValidator;
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor(context: vscode.ExtensionContext) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('lark-diagnostics');
        this.documentAnalysisResult = new Map<string, AnalysisResult>();
        this.analyzer = new LarkDocumentAnalyzer();
        this.validator = new LarkValidator();

        context.subscriptions.push(this.diagnosticCollection);
    }

    public listen() {
        // Register event listeners that will eventually call handleDocumentChange
        vscode.workspace.onDidOpenTextDocument((doc) => this.handleDocumentChange(doc));
        vscode.workspace.onDidChangeTextDocument((e) => this.handleDocumentChange(e.document));
        vscode.workspace.onDidCloseTextDocument((doc) => {
            this.diagnosticCollection.delete(doc.uri);
            this.documentAnalysisResult.delete(doc.uri.toString());
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
        const analysisResult = await this.analyzer.analyze(document);
        this.documentAnalysisResult.set(document.uri.toString(), analysisResult);

        // Step 2: Validate the document using the new symbol table.
        const diagnostics = this.validator.validate(document, analysisResult);
        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    public getSymbolTable(uri: vscode.Uri): LarkSymbolTable | undefined {
        return this.documentAnalysisResult.get(uri.toString())?.symbolTable as LarkSymbolTable;
    }
}
