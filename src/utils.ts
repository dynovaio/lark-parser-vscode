import { DocumentSelector } from 'vscode-languageclient';
import { isVirtualWorkspace } from './workspace';

export function getDocumentSelector(): DocumentSelector {
    return isVirtualWorkspace()
        ? [{ language: 'lark' }]
        : [
              { language: 'lark', scheme: 'file' },
              { language: 'lark', scheme: 'untitled' }
          ];
}
