import {
    TreeDataProvider,
    TreeItem,
    EventEmitter,
    TextDocument,
    ProviderResult,
    Event
} from 'vscode';

export class LarkTreeDataProvider<T extends TreeItem> implements TreeDataProvider<TreeItem> {
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

    getChildren(_element?: T): ProviderResult<T[]> {
        return [];
    }
}
