import {
    TreeDataProvider,
    TreeItem,
    EventEmitter,
    TextDocument,
    ProviderResult,
    Event,
    SymbolInformation,
    DocumentSymbol
} from 'vscode';
import { getLanguageInfo } from '../settings';
import { extensionLogger } from '../logger';

export abstract class LarkTreeDataProvider<T extends TreeItem>
    implements TreeDataProvider<TreeItem>
{
    protected children: T[] = [];

    private _onDidChangeTreeData: EventEmitter<T | undefined | void> = new EventEmitter<
        T | undefined | void
    >();
    readonly onDidChangeTreeData: Event<T | undefined | void> = this._onDidChangeTreeData.event;

    constructor(protected document: TextDocument) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: T): TreeItem {
        return element;
    }

    getChildren(element?: T): ProviderResult<T[]> {
        return new Promise((resolve) => {
            if (element) {
                resolve([]);
            } else {
                resolve(this.children);
            }
        });
    }

    setChildren(children: T[]): void {
        this.children = children;
        this.refresh();
    }

    async clearChildren(document?: TextDocument): Promise<void> {
        const { id: languageId } = getLanguageInfo();

        if (!document || document.languageId !== languageId) {
            extensionLogger.log('Clearing children as no valid document is provided.');
            this.setChildren([]);
        }
    }

    abstract captureChildren(
        document: TextDocument,
        symbols: SymbolInformation[] | DocumentSymbol[]
    ): void;
}
