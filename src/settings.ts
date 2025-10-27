import { PACKAGE_JSON } from './constants';

export interface ILanguageServerPackageInfo {
    name: string;
    version: string;
}
export interface ILanguageServerInfo {
    name: string;
    module: string;
    package: ILanguageServerPackageInfo;
}

export function getLanguageServerInfo(): ILanguageServerInfo {
    return PACKAGE_JSON.languageServerInfo as ILanguageServerInfo;
}
