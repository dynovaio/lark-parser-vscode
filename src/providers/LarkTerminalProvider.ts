import * as path from 'path';
import {} from 'vscode';
import {
    TextDocument,
    TreeItem,
    TreeItemCollapsibleState,
    IconPath,
    SymbolInformation,
    DocumentSymbol,
    SymbolKind,
    Uri,
    Command
} from 'vscode';
import { extensionLogger } from '../logger';
import { LarkTreeDataProvider } from './LarkTreeDataProvier';
import { getLanguageInfo, getLanguageServerInfo } from '../settings';

export class LarkTerminal extends TreeItem {
    public override iconPath: IconPath = {
        light: Uri.file(path.join(__dirname, '../images/_lark_view_terminal_dark.svg')),
        dark: Uri.file(path.join(__dirname, '../images/_lark_view_terminal_light.svg'))
    };

    public override contextValue: string = 'larkTerminal';

    constructor(
        public override readonly label: string,
        public override readonly collapsibleState: TreeItemCollapsibleState,
        command?: Command
    ) {
        super(label, collapsibleState);
        this.command = command;
    }
}

export class LarkTerminalProvider extends LarkTreeDataProvider<LarkTerminal> {
    protected symbolKind: SymbolKind = SymbolKind.Constant;

    captureChildren(document: TextDocument, symbols: SymbolInformation[] | DocumentSymbol[]): void {
        const capturedChildren: LarkTerminal[] = [];

        const { id: languageId } = getLanguageInfo();

        if (document.languageId !== languageId || !symbols || symbols.length === 0) {
            extensionLogger.log('LarkTerminalProvider: No symbols found.');
            return;
        }

        for (const symbol of symbols) {
            if (symbol.kind === this.symbolKind) {
                const { module: languageServerModule } = getLanguageServerInfo();
                const range =
                    symbol instanceof DocumentSymbol ? symbol.range : symbol.location.range;

                const command: Command = {
                    title: 'Go to Rule',
                    command: `${languageServerModule}.revealRange`,
                    arguments: [document, range]
                };
                capturedChildren.push(
                    new LarkTerminal(symbol.name, TreeItemCollapsibleState.None, command)
                );
            }
        }

        this.document = document;
        this.setChildren(capturedChildren);
    }
}
