import { TreeItem, window, CancellationTokenSource } from 'vscode';
import { LarkTreeDataProvider } from './providers/LarkTreeDataProvier';
import { extensionLogger } from './logger';
import { LarkClient } from './language-server';
import { getLanguageInfo } from './settings';

export function registerPopulateViewDisposable<T extends TreeItem>(
    viewId: string,
    dataProvider: LarkTreeDataProvider<T>
) {
    return window.registerTreeDataProvider(viewId, dataProvider);
}

export function registerClearViewDisposable<T extends TreeItem>(
    dataProvider: LarkTreeDataProvider<T>
) {
    return window.onDidChangeActiveTextEditor(async (editor) => {
        extensionLogger.log(`Clearing view for editor: ${editor?.document.uri.toString()}`);
        await dataProvider.clearChildren(editor?.document);
    });
}

export function registerRequestSymbolsDisposable(client: LarkClient) {
    return window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor?.document) {
            const { id: languageId } = getLanguageInfo();
            if (editor.document.languageId === languageId) {
                const languageClient = await client.getLanguageClient();
                if (languageClient) {
                    try {
                        const symbolProvider = languageClient
                            .getFeature('textDocument/documentSymbol')
                            .getProvider(editor.document);
                        await symbolProvider?.provideDocumentSymbols(
                            editor.document,
                            new CancellationTokenSource().token
                        );
                    } catch (error) {
                        extensionLogger.log(
                            `Error requesting document symbols: ${(error as Error).message}`
                        );
                    }
                }
            }
        }
    });
}
