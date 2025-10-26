import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';
import {
    getPythonInterpreter,
    installLarkParserLanguageServer,
    isLarkParserLanguageServerInstalled,
    isSupportedLarkParserLanguageServerVersion
} from './python';
import { getDocumentSelector } from './utils';
import { extensionLogger, extensionOutputChannel, extensionTraceOutputChannel } from './logger';

let client: LanguageClient | undefined;

export async function getServerOptions(
    context: ExtensionContext,
    useExtensionBundle: boolean
): Promise<ServerOptions> {
    const pythonInterpreter = await getPythonInterpreter();
    const pythonInterpreterPath = pythonInterpreter.path;

    const config = workspace.getConfiguration('lark');
    const serverArguments = config.get<string[]>('server.arguments', []);

    extensionLogger.log('Determining server options for Lark Language Server...');

    let languageServerCommandArgs: string[] = ['-m', 'lark_parser_language_server'];

    if (useExtensionBundle) {
        extensionLogger.log('Using bundled Lark Language Server from the extension.');
        const extensionRoot = context.extensionPath;
        const bundledEnvironmentPath = path.join(extensionRoot, 'bundled');
        const entryPointPath = path.join(bundledEnvironmentPath, 'entrypoint.py');
        languageServerCommandArgs = [entryPointPath];
    }

    return {
        command: pythonInterpreterPath,
        args: [...languageServerCommandArgs, ...serverArguments],
        transport: TransportKind.stdio,
        options: {
            cwd: context.extensionPath,
            env: { ...process.env }
        }
    };
}

export async function startLanguageServer(context: ExtensionContext): Promise<void> {
    const config = workspace.getConfiguration('lark');

    // Check if language server is enabled
    if (!config.get<boolean>('server.enabled', true)) {
        console.log('Lark Language Server is disabled');
        return;
    }

    const pythonInterpreter = await getPythonInterpreter();
    const pythonInterpreterPath = pythonInterpreter.path;

    let useExtensionBundle = true;

    if (
        isLarkParserLanguageServerInstalled(pythonInterpreterPath) &&
        isSupportedLarkParserLanguageServerVersion(pythonInterpreterPath)
    ) {
        extensionLogger.log('Lark Language Server is already installed and up to date.');
        useExtensionBundle = false;
    } else {
        extensionLogger.log('Lark Language Server is not installed or outdated. Installing...');
        await installLarkParserLanguageServer(pythonInterpreterPath, context);
    }

    // Try to determine the best server options
    const serverOptions = await getServerOptions(context, useExtensionBundle);

    extensionLogger.log(
        `Starting Lark Language Server using Python interpreter at: ${pythonInterpreterPath}`
    );

    // Client options
    const clientOptions: LanguageClientOptions = {
        documentSelector: getDocumentSelector(),
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.lark'),
            configurationSection: 'lark'
        },
        outputChannel: extensionOutputChannel,
        traceOutputChannel: extensionTraceOutputChannel
    };

    // Create the language client
    client = new LanguageClient(
        'lark-parser-language-server',
        'Lark Parser Language Server',
        serverOptions,
        clientOptions
    );

    // Start the client and server
    client.start();
}

export function stopLanguageServer(): Thenable<void> | undefined {
    if (client) {
        extensionLogger.log('Stopping Lark Language Server...');
        client.stop();
        client = undefined;
    }

    return Promise.resolve();
}
