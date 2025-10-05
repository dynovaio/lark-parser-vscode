import * as vscode from 'vscode';
import { extensionLogger, extensionOutputChannel, extensionTraceOutputChannel } from './logger';
import { startLanguageServer, stopLanguageServer } from './language-server';
import { getLanguageServerInfo } from './settings';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(extensionOutputChannel);
    context.subscriptions.push(extensionTraceOutputChannel);

    const { name: languageServerName, module: languageServerModule } = getLanguageServerInfo();

    extensionLogger.log('Activating Lark Language Server extension...');

    const showLogsCommand = vscode.commands.registerCommand(
        `${languageServerModule}.showLogs`,
        () => {
            extensionOutputChannel.show();
        }
    );

    const restartCommand = vscode.commands.registerCommand(
        `${languageServerModule}.restartServer`,
        async () => {
            extensionLogger.log('Restarting Lark Language Server...');
            await stopLanguageServer();
            await startLanguageServer(context);
            vscode.window.showInformationMessage(`${languageServerName} Language Server restarted`);
        }
    );

    context.subscriptions.push(showLogsCommand);
    context.subscriptions.push(restartCommand);

    await startLanguageServer(context);
}

export function deactivate(): Thenable<void> | undefined {
    return stopLanguageServer();
}
