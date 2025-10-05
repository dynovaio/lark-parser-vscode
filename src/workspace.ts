import * as path from 'path';
import * as fs from 'fs';

import { workspace, Uri, WorkspaceFolder } from 'vscode';

export async function getWorkspaceRoot(): Promise<WorkspaceFolder> {
    const workspaces: readonly WorkspaceFolder[] = workspace.workspaceFolders ?? [];
    if (workspaces.length === 0) {
        return {
            uri: Uri.file(process.cwd()),
            name: path.basename(process.cwd()),
            index: 0
        };
    }

    if (workspaces.length === 1) {
        return workspaces[0];
    }

    let rootWorkspace = workspaces[0];
    let root = undefined;
    for (const w of workspaces) {
        if (fs.existsSync(w.uri.fsPath)) {
            root = w.uri.fsPath;
            rootWorkspace = w;
            break;
        }
    }

    for (const w of workspaces) {
        if (root && root.length > w.uri.fsPath.length && fs.existsSync(w.uri.fsPath)) {
            root = w.uri.fsPath;
            rootWorkspace = w;
        }
    }
    return rootWorkspace;
}
