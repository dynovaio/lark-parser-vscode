import * as path from 'path';
import { workspace, ExtensionContext, OutputChannel } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
    Middleware,
    Executable
} from 'vscode-languageclient/node';
import { extensionLogger } from './logger';
import { PythonEnvironment } from './python';
import { getDocumentSelector } from './utils';

export class LarkClient {
    private client?: LanguageClient;
    private useExtensionBundle: boolean = false;

    public isInitialized: boolean = false;

    constructor(
        private context: ExtensionContext,
        private environment: PythonEnvironment,
        private middleware: Middleware,
        private outputChannel: OutputChannel,
        private traceOutputChannel: OutputChannel
    ) {}

    async getLanguageClient(): Promise<LanguageClient | undefined> {
        return this.client;
    }

    async getServerArguments(): Promise<string[]> {
        const config = workspace.getConfiguration('lark');
        const serverArguments = config.get<string[]>('server.arguments', []);

        let languageServerCommandArgs: string[] = ['-m', 'lark_parser_language_server'];

        if (this.useExtensionBundle) {
            extensionLogger.log('Using bundled Lark Parser Language Server from the extension.');
            const extensionRoot = this.context.extensionPath;
            const bundledEnvironmentPath = path.join(extensionRoot, 'bundled');
            const entryPointPath = path.join(bundledEnvironmentPath, 'entrypoint.py');
            languageServerCommandArgs = [entryPointPath];
        }

        return [...languageServerCommandArgs, ...serverArguments];
    }

    async getServerOptions(): Promise<ServerOptions> {
        extensionLogger.log('Getting server options for Lark Parser Language Server...');

        return {
            command: await this.environment.getInterpreterPath(),
            args: await this.getServerArguments(),
            transport: TransportKind.stdio,
            options: {
                cwd: this.context.extensionPath,
                env: { ...process.env }
            }
        };
    }

    async getClientOptions(): Promise<LanguageClientOptions> {
        return {
            documentSelector: getDocumentSelector(),
            synchronize: {
                fileEvents: workspace.createFileSystemWatcher('**/*.lark'),
                configurationSection: 'lark'
            },
            outputChannel: this.outputChannel,
            traceOutputChannel: this.traceOutputChannel,
            middleware: this.middleware
        };
    }

    async initialize(): Promise<void> {
        const config = workspace.getConfiguration('lark');

        if (!config.get<boolean>('server.enabled', true)) {
            console.log('Lark Parser Language Server is disabled');
            return;
        }

        if (
            (await this.environment.isLarkLanguageServerInstalled()) &&
            (await this.environment.isLarkLanguageServerVersionSupported())
        ) {
            extensionLogger.log('Lark Parser Language Server is already installed and up to date.');
            this.useExtensionBundle = false;
        } else {
            extensionLogger.log(
                'Lark Parser Language Server is not installed or outdated. Installing...'
            );
            await this.environment.installLarkLanguageServer();
            this.useExtensionBundle = true;
        }

        const serverOptions = (await this.getServerOptions()) as Executable;

        extensionLogger.log('Server options for Lark Parser Language Server obtained.');
        extensionLogger.log(`Server command: ${serverOptions.command}`);
        extensionLogger.log(`Server arguments: ${serverOptions.args?.join(' ')}`);

        const clientOptions = await this.getClientOptions();

        this.client = new LanguageClient(
            'lark-parser-language-server',
            'Lark Parser Language Server',
            serverOptions,
            clientOptions
        );
        this.isInitialized = true;
    }

    async start(): Promise<void> {
        if (!this.client) {
            extensionLogger.log('Lark Parser Language Server is not initialized.');
            this.isInitialized = false;
            return Promise.resolve();
        }

        extensionLogger.log('Starting Lark Parser Language Server...');
        return await this.client.start();
    }

    async stop(): Promise<void> {
        if (!this.client) {
            extensionLogger.log('Lark Parser Language Server is not running.');
            this.isInitialized = false;
            return Promise.resolve();
        }

        extensionLogger.log('Stopping Lark Parser Language Server...');
        await this.client.stop();
        this.client = undefined;
        this.isInitialized = false;
    }
}
