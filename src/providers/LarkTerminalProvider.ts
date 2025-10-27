import * as path from 'path';
import {} from 'vscode';
import {
    TextDocument,
    TreeItem,
    TreeItemCollapsibleState,
    ProviderResult,
    IconPath,
    SymbolInformation,
    DocumentSymbol,
    SymbolKind,
    Uri
} from 'vscode';
import { extensionLogger } from '../logger';
import { LarkTreeDataProvider } from './LarkTreeDataProvier';

export class LarkTerminal extends TreeItem {
    public override iconPath: IconPath = {
        light: Uri.file(path.join(__dirname, '../images/_lark_view_terminal_dark.svg')),
        dark: Uri.file(path.join(__dirname, '../images/_lark_view_terminal_light.svg'))
    };

    public override contextValue: string = 'larkTerminal';

    constructor(
        public override readonly label: string,
        public override readonly collapsibleState: TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}

export class LarkTerminalProvider extends LarkTreeDataProvider<LarkTerminal> {
    private children: LarkTerminal[] = [];

    override getChildren(element?: LarkTerminal): ProviderResult<LarkTerminal[]> {
        return new Promise((resolve) => {
            if (element) {
                resolve([]);
            } else {
                resolve(this.children);
            }
        });
    }

    captureTerminals(
        document: TextDocument,
        symbols: SymbolInformation[] | DocumentSymbol[]
    ): void {
        this.document = document;
        this.children = [];

        if (!symbols || symbols.length === 0) {
            extensionLogger.log('LarkTerminalProvider: No symbols found.');
        } else {
            for (const symbol of symbols) {
                if (symbol.kind === SymbolKind.Constant) {
                    this.children.push(
                        new LarkTerminal(symbol.name, TreeItemCollapsibleState.None)
                    );
                }
            }
        }

        this.refresh();
    }
}
