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

let larkClient: LarkClient;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(extensionOutputChannel);
    context.subscriptions.push(extensionTraceOutputChannel);

    const { name: languageServerName, module: languageServerModule } = getLanguageServerInfo();

    extensionLogger.log(`Activating ${languageServerName} extension...`);

    const pythonExtension = new PythonExtension();
    const pythonInterpreter = new PythonInterpreter(pythonExtension);
    const pythonEnvironment = new PythonEnvironment(context, pythonInterpreter);

    const larkTerminalProvider = new LarkTerminalProvider(
        vscode.window.activeTextEditor?.document!
    );

    const larkRuleProvider = new LarkRuleProvider(vscode.window.activeTextEditor?.document!);

    larkClient = new LarkClient(
        context,
        pythonEnvironment,
        {
            provideDocumentSymbols: async (document, token, next) => {
                const response = await next(document, token);

                larkTerminalProvider.captureTerminals(document, response ?? []);
                larkRuleProvider.captureRules(document, response ?? []);

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

    context.subscriptions.push(showLogsCommand);
    context.subscriptions.push(restartCommand);
    context.subscriptions.push(removeCommand);
    context.subscriptions.push(revealRangeCommand);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('lark.terminals', larkTerminalProvider)
    );
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('lark.rules', larkRuleProvider)
    );

    await larkClient.initialize();
    await larkClient.start();
}

export function deactivate(): Thenable<void> | undefined {
    return larkClient.stop();
}
