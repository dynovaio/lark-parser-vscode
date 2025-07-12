import * as vscode from 'vscode';
import { LarkSymbolProvider } from './providers/LarkSymbolProvider';
import { LarkDocumentManager } from './orchestration/LarkDocumentManager';

const activate = (context: vscode.ExtensionContext) => {
    const selector = { language: 'lark', scheme: 'file' };

    const manager = new LarkDocumentManager(context);
    manager.listen();

    const symbolProvider = new LarkSymbolProvider(manager);
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider)
    );
};

const deactivate = () => {};

module.exports = { activate, deactivate };
