import * as vscode from 'vscode';
import { extensionLogger, extensionOutputChannel, extensionTraceOutputChannel } from './logger';
import { LarkClient } from './language-server';
import { getLanguageServerInfo } from './settings';
import { PythonExtension, PythonInterpreter, PythonEnvironment } from './python';
import { LarkTerminalProvider } from './providers/LarkTerminalProvider';
import { LarkRuleProvider } from './providers/LarkRuleProvider';
import {
    registerShowLogsCommand,
    registerRestartCommand,
    registerRemoveCommand,
    registerRevealRangeCommand
} from './commands';
import { LarkTerminal } from './providers/LarkTerminalProvider';
import { LarkRule } from './providers/LarkRuleProvider';
import {
    registerClearViewDisposable,
    registerPopulateViewDisposable,
    registerRequestSymbolsDisposable
} from './disposables';

let larkClient: LarkClient;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const { name: languageServerName, module: languageServerModule } = getLanguageServerInfo();

    context.subscriptions.push(extensionOutputChannel);
    context.subscriptions.push(extensionTraceOutputChannel);

    extensionLogger.log(`Activating ${languageServerName} extension...`);

    const pythonExtension = new PythonExtension();
    const pythonInterpreter = new PythonInterpreter(pythonExtension);
    const pythonEnvironment = new PythonEnvironment(context, pythonInterpreter);

    const larkTerminalProvider = new LarkTerminalProvider(
        vscode.window.activeTextEditor?.document!
    );
    const populateTerminalViewDisposable = registerPopulateViewDisposable<LarkTerminal>(
        'lark.terminals',
        larkTerminalProvider
    );
    const clearTerminalViewDisposable =
        registerClearViewDisposable<LarkTerminal>(larkTerminalProvider);

    const larkRuleProvider = new LarkRuleProvider(vscode.window.activeTextEditor?.document!);
    const populateRuleViewDisposable = registerPopulateViewDisposable<LarkRule>(
        'lark.rules',
        larkRuleProvider
    );
    const clearRuleViewDisposable = registerClearViewDisposable<LarkRule>(larkRuleProvider);

    larkClient = new LarkClient(
        context,
        pythonEnvironment,
        {
            provideDocumentSymbols: async (document, token, next) => {
                const response = await next(document, token);

                larkTerminalProvider.captureChildren(document, response ?? []);
                larkRuleProvider.captureChildren(document, response ?? []);

                return response;
            }
        },
        extensionOutputChannel,
        extensionTraceOutputChannel
    );

    const showLogsCommand = registerShowLogsCommand(languageServerModule);
    const restartCommand = registerRestartCommand(
        languageServerModule,
        languageServerName,
        larkClient
    );
    const removeCommand = registerRemoveCommand(
        languageServerModule,
        languageServerName,
        pythonEnvironment
    );
    const revealRangeCommand = registerRevealRangeCommand(languageServerModule);

    const documentSymbolsDisposable = registerRequestSymbolsDisposable(larkClient);

    context.subscriptions.push(showLogsCommand);
    context.subscriptions.push(restartCommand);
    context.subscriptions.push(removeCommand);
    context.subscriptions.push(revealRangeCommand);
    context.subscriptions.push(populateTerminalViewDisposable);
    context.subscriptions.push(clearTerminalViewDisposable);
    context.subscriptions.push(populateRuleViewDisposable);
    context.subscriptions.push(clearRuleViewDisposable);
    context.subscriptions.push(documentSymbolsDisposable);

    extensionLogger.log(`Initializing ${languageServerName} Language Server...`);

    await larkClient.initialize();
    await larkClient.start();

    extensionLogger.log(`${languageServerName} extension activated successfully.`);
}

export function deactivate(): Thenable<void> | undefined {
    return larkClient.stop();
}
