import * as vscode from 'vscode';
import { extensionLogger, extensionOutputChannel } from './logger';
import { LarkClient } from './language-server';
import { PythonEnvironment } from './python';
import { window } from 'vscode';

export function registerShowLogsCommand(languageServerModule: string) {
    return vscode.commands.registerCommand(`${languageServerModule}.showLogs`, () => {
        extensionOutputChannel.show();
    });
}

export function registerRestartCommand(
    languageServerModule: string,
    languageServerName: string,
    larkClient: LarkClient
) {
    return vscode.commands.registerCommand(`${languageServerModule}.restart`, async () => {
        extensionLogger.log(`Restarting the ${languageServerName} Language Server...`);
        await larkClient.stop();
        await larkClient.initialize();
        await larkClient.start();
        vscode.window.showInformationMessage(`${languageServerName} Language Server restarted`);
    });
}

export function registerRemoveCommand(
    languageServerModule: string,
    languageServerName: string,
    environment: PythonEnvironment
) {
    return vscode.commands.registerCommand(
        `${languageServerModule}.removeBundledEnvironment`,
        async () => {
            extensionLogger.log(`Removing bundled environment for ${languageServerName}...`);
            await environment.remove();
            vscode.window.showInformationMessage(`Bundled environment removed`);
        }
    );
}

export function registerRevealRangeCommand(languageServerModule: string) {
    return vscode.commands.registerCommand(
        `${languageServerModule}.revealRange`,
        (document: vscode.TextDocument, range: vscode.Range) => {
            if (window.activeTextEditor) {
                const activeDocument = window.activeTextEditor.document;
                if (activeDocument.uri.toString() === document.uri.toString()) {
                    window.activeTextEditor.selection = new vscode.Selection(
                        range.start,
                        range.end
                    );
                    window.activeTextEditor?.revealRange(
                        range,
                        vscode.TextEditorRevealType.InCenterIfOutsideViewport
                    );
                }
            }
        }
    );
}
