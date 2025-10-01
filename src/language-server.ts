import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { execSync } from 'child_process';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export function getPythonExecutable(): string {
    const candidates = ['python3', 'python'];

    for (const candidate of candidates) {
        try {
            const result = execSync(`${candidate} --version`, { encoding: 'utf8' });
            if (result.startsWith('Python')) {
                return candidate;
            }
        } catch {
            // Ignore errors and try next candidate
        }
    }

    throw new Error('No suitable Python interpreter found. Please install Python 3.');
}

export function getServerOptions(context: vscode.ExtensionContext): ServerOptions {
    const config = vscode.workspace.getConfiguration('lark');
    const customPythonPath = config.get<string>('server.pythonPath');
    const serverArguments = config.get<string[]>('server.arguments', []);

    // If user specified a custom server path, use it
    if (customPythonPath) {
        console.log(`Using custom server path: ${customPythonPath}`);
        return {
            command: customPythonPath,
            args: ['-m', 'lark_parser_language_server', ...serverArguments],
            transport: TransportKind.stdio,
            options: {
                cwd: context.extensionPath,
                env: { ...process.env }
            }
        };
    }

    // Try bundled server first
    const bundledServerPath = path.join(
        context.extensionPath,
        'bundled',
        'lark_parser_language_server',
        '__main__.py'
    );
    if (fs.existsSync(bundledServerPath)) {
        console.log(`Using bundled server: ${bundledServerPath}`);
        return {
            command: getPythonExecutable(),
            args: [bundledServerPath, ...serverArguments],
            transport: TransportKind.stdio,
            options: {
                cwd: context.extensionPath,
                env: { ...process.env }
            }
        };
    }

    // Fallback to Poetry if available
    const poetryLockPath = path.join(context.extensionPath, 'poetry.lock');
    if (fs.existsSync(poetryLockPath)) {
        console.log('Using Poetry server (development mode)');
        return {
            command: 'poetry',
            args: ['run', 'python', '-m', 'lark_parser_language_server', ...serverArguments],
            transport: TransportKind.stdio,
            options: {
                cwd: context.extensionPath,
                env: { ...process.env }
            }
        };
    }

    // Final fallback: try system Python with the source
    const srcServerPath = path.join(context.extensionPath, 'src');
    console.log('Using system Python with source path (fallback)');
    return {
        command: getPythonExecutable(),
        args: ['-m', 'lark_parser_language_server', ...serverArguments],
        transport: TransportKind.stdio,
        options: {
            cwd: context.extensionPath,
            env: {
                ...process.env,
                PYTHONPATH: srcServerPath
            }
        }
    };
}

export function startLanguageServer(context: vscode.ExtensionContext): void {
    const config = vscode.workspace.getConfiguration('lark');

    // Check if language server is enabled
    if (!config.get<boolean>('server.enabled', true)) {
        console.log('Lark Language Server is disabled');
        return;
    }

    // Try to determine the best server options
    const serverOptions = getServerOptions(context);

    // Client options
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'lark' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.lark')
        },
        outputChannel: vscode.window.createOutputChannel('Lark Parser Language Server'),
        traceOutputChannel: vscode.window.createOutputChannel('Lark Parser Language Server Trace')
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
        client.clientOptions.outputChannel?.appendLine('Stopping Lark Language Server...');
        client.clientOptions.traceOutputChannel?.appendLine('Stopping Lark Language Server...');

        client.stop();

        client.clientOptions.outputChannel?.dispose();
        client.clientOptions.traceOutputChannel?.dispose();

        client = undefined;
    }

    return Promise.resolve();
}
