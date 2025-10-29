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

export interface ILanguageInfo {
    id: string;
    aliases: string[];
    extensions: string[];
}

export function getLanguageServerInfo(): ILanguageServerInfo {
    return PACKAGE_JSON.languageServerInfo as ILanguageServerInfo;
}

export function getLanguageInfo(): ILanguageInfo {
    return PACKAGE_JSON.contributes.languages[0] as ILanguageInfo;
}
