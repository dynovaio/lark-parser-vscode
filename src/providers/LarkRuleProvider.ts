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

export class LarkRule extends TreeItem {
    public override iconPath: IconPath = {
        light: Uri.file(path.join(__dirname, '../images/_lark_view_rule_dark.svg')),
        dark: Uri.file(path.join(__dirname, '../images/_lark_view_rule_light.svg'))
    };

    public override contextValue: string = 'larkRule';

    constructor(
        public override readonly label: string,
        public override readonly collapsibleState: TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}

export class LarkRuleProvider extends LarkTreeDataProvider<LarkRule> {
    private children: LarkRule[] = [];

    override getChildren(element?: LarkRule): ProviderResult<LarkRule[]> {
        return new Promise((resolve) => {
            if (element) {
                resolve([]);
            } else {
                resolve(this.children);
            }
        });
    }

    captureRules(document: TextDocument, symbols: SymbolInformation[] | DocumentSymbol[]): void {
        this.document = document;
        this.children = [];

        if (!symbols || symbols.length === 0) {
            extensionLogger.log('LarkRuleProvider: No symbols found.');
        } else {
            for (const symbol of symbols) {
                if (symbol.kind === SymbolKind.Method) {
                    this.children.push(new LarkRule(symbol.name, TreeItemCollapsibleState.None));
                }
            }
        }

        this.refresh();
    }
}
