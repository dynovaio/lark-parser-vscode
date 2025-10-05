import * as vscode from 'vscode';

import { EXTENSION_ID } from './constants';
import { getLanguageServerInfo } from './settings';

const { name: languageServerName } = getLanguageServerInfo();

export const extensionOutputChannel = vscode.window.createOutputChannel(
    `${languageServerName} Extension`
);
export const extensionTraceOutputChannel = vscode.window.createOutputChannel(
    `${languageServerName} Extension Trace`
);

class ExtensionLogger {
    static prefix = EXTENSION_ID;

    static debugStyle = 'color: #13c2c2;';
    static infoStyle = 'color: #1677ff;';
    static errorStyle = 'color: #f5222d;';

    static log(message: string): void {
        const timestamp = new Date().toISOString();
        extensionOutputChannel.appendLine(`${timestamp} - ${this.prefix} - INFO :: ${message}`);
        console.log(
            '%c%s - %s - %s :: %s',
            this.infoStyle,
            timestamp,
            this.prefix,
            'INFO',
            message
        );
    }

    static debug(message: string): void {
        const timestamp = new Date().toISOString();
        extensionTraceOutputChannel.appendLine(
            `${timestamp} - ${this.prefix} - DEBUG :: ${message}`
        );
        console.debug(
            '%c%s - %s - %s :: %s',
            this.debugStyle,
            timestamp,
            this.prefix,
            'DEBUG',
            message
        );
    }

    static error(message: string): void {
        const timestamp = new Date().toISOString();
        extensionOutputChannel.appendLine(`${timestamp} - ${this.prefix} - ERROR :: ${message}`);
        extensionTraceOutputChannel.appendLine(
            `${timestamp} - ${this.prefix} - ERROR :: ${message}`
        );
        console.error(
            '%c%s - %s - %s :: %s',
            this.errorStyle,
            timestamp,
            this.prefix,
            'ERROR',
            message
        );
    }
}

export const extensionLogger = ExtensionLogger;
