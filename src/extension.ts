import * as vscode from 'vscode';

import { startLanguageServer, stopLanguageServer } from './language-server';

export function activate(context: vscode.ExtensionContext): void {
    console.log('Activating Lark Language Server extension...');

    // Register command to restart the language server
    const restartCommand = vscode.commands.registerCommand('lark.restartServer', async () => {
        await stopLanguageServer();
        startLanguageServer(context);
        vscode.window.showInformationMessage('Lark Language Server restarted');
    });

    context.subscriptions.push(restartCommand);

    startLanguageServer(context);
}

export function deactivate(): Thenable<void> | undefined {
    return stopLanguageServer();
}
