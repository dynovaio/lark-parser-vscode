import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { ExtensionContext, Uri, workspace, extensions } from 'vscode';
import { PythonExtension as VsCodePythonExtension } from '@vscode/python-extension';

import { extensionLogger } from './logger';
import {
    PYTHON_VERSION,
    PYTHON_MAJOR,
    PYTHON_MINOR,
    PYTHON_EXTENSION_ID,
    PYTHON_EXTENSION_TIMEOUT,
    PYTHON_CANDIDATES
} from './constants';
import { getLanguageServerInfo } from './settings';

export interface IInterpreterDetails {
    path: string;
    resource?: Uri;
}

export class PythonExtension {
    _api: VsCodePythonExtension | undefined;

    constructor() {}

    isEnabled(): boolean {
        const pythonExtension = extensions.getExtension(PYTHON_EXTENSION_ID);
        return pythonExtension !== undefined && pythonExtension.isActive;
    }

    async getApi(): Promise<VsCodePythonExtension | undefined> {
        if (this._api) {
            return this._api;
        }

        if (!this.isEnabled()) {
            extensionLogger.log('Python extension is not installed or not active.');
            return undefined;
        }

        try {
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(
                    () => reject(new Error('Timeout getting Python extension API')),
                    PYTHON_EXTENSION_TIMEOUT
                );
            });

            this._api = await Promise.race([VsCodePythonExtension.api(), timeoutPromise]);

            return this._api;
        } catch (error) {
            extensionLogger.error(`Failed to get Python extension API: ${error}`);
            return undefined;
        }
    }
}

export class PythonInterpreter {
    private _path: string | undefined = undefined;

    constructor(public extension: PythonExtension) {}

    isSupportedVersion(pythonPath: string | undefined): boolean {
        if (!pythonPath) {
            extensionLogger.error('Python interpreter path is undefined.');
            return false;
        }

        const result = execSync(
            `${pythonPath} -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"`,
            { encoding: 'utf8' }
        ).trim();

        const versionParts = result.split('.');
        if (versionParts.length < 2) {
            extensionLogger.error(`Unexpected Python version format: ${result}`);
            return false;
        }

        const version = {
            major: parseInt(versionParts[0], 10),
            minor: parseInt(versionParts[1], 10)
        };

        if (version?.major >= PYTHON_MAJOR && version?.minor >= PYTHON_MINOR) {
            return true;
        }

        extensionLogger.error(
            `Python version ${version?.major}.${version?.minor} is not supported.`
        );
        extensionLogger.error(`Selected python path: ${pythonPath}`);
        extensionLogger.error(`Supported versions are ${PYTHON_VERSION} and above.`);
        return false;
    }

    private async getPathFromSettings(): Promise<string | undefined> {
        const config = workspace.getConfiguration('lark');
        const customPythonPath = config.get<string>('server.pythonPath');

        if (customPythonPath) {
            this._path = customPythonPath;
            return this._path;
        }

        return undefined;
    }

    private async getPathFromEnvironment(): Promise<string | undefined> {
        extensionLogger.log('Checking Python extension for active interpreter...');

        if (!this.extension.isEnabled()) {
            extensionLogger.log('Python extension is not available, skipping...');
            return undefined;
        }

        const api = await this.extension.getApi();

        if (!api) {
            extensionLogger.warn('Python extension API is not available.');
            return undefined;
        }

        try {
            const environment = await api.environments.resolveEnvironment(
                api.environments.getActiveEnvironmentPath()
            );

            if (!environment) {
                extensionLogger.warn('No active Python environment found in Python extension.');
                return undefined;
            }

            extensionLogger.log(
                `Using Python interpreter from Python extension: ${environment.executable.uri?.fsPath}`
            );
            return environment.executable.uri?.fsPath;
        } catch (error) {
            extensionLogger.error(`Error getting Python interpreter from extension: ${error}`);
            return undefined;
        }
    }

    private async getPathFromSystem(): Promise<string | undefined> {
        extensionLogger.log('Checking system PATH for python executable...');

        for (const candidate of PYTHON_CANDIDATES) {
            try {
                const result = execSync(`${candidate} --version`, {
                    encoding: 'utf8'
                });
                if (result.startsWith('Python')) {
                    return execSync(`${candidate} -c "import sys; print(sys.executable)"`, {
                        encoding: 'utf8'
                    }).trim();
                }
            } catch {
                extensionLogger.error(
                    `No suitable Python interpreter found for candidate: ${candidate}`
                );
            }
        }

        extensionLogger.warn('No suitable Python interpreter found in system PATH.');
        return undefined;
    }

    async getPath(): Promise<string> {
        if (this._path) {
            return this._path;
        }

        extensionLogger.log('Resolving Python interpreter path...');

        // Check custom path in Lark extension settings first
        let path = await this.getPathFromSettings();
        if (path && this.isSupportedVersion(path)) {
            extensionLogger.log(`Using Python interpreter from Lark extension settings: ${path}`);
            this._path = path;
            return this._path;
        }

        // Check Python extension API next
        path = await this.getPathFromEnvironment();
        if (path && this.isSupportedVersion(path)) {
            extensionLogger.log(`Using Python interpreter from Python extension API: ${path}`);
            this._path = path;
            return this._path;
        }

        // Finally, check system PATH
        path = await this.getPathFromSystem();
        if (path && this.isSupportedVersion(path)) {
            extensionLogger.log(`Using Python interpreter from system PATH: ${path}`);
            this._path = path;
            return this._path;
        }

        extensionLogger.error(
            'No suitable Python interpreter found. Please install Python 3.9 or above.'
        );

        throw new Error(
            'No suitable Python interpreter found. Please install Python 3.9 or above.'
        );
    }
}

export class PythonEnvironment {
    constructor(private context: ExtensionContext, private interpreter: PythonInterpreter) {}

    async getInterpreterPath(): Promise<string> {
        return this.interpreter.getPath();
    }

    async getExtensionAPI(): Promise<VsCodePythonExtension | undefined> {
        return await this.interpreter.extension.getApi();
    }

    async isLarkLanguageServerInstalled(): Promise<boolean> {
        try {
            const pythonPath = await this.getInterpreterPath();
            execSync(`${pythonPath} -c "import lark_parser_language_server"`, {
                encoding: 'utf8'
            });
            extensionLogger.log(
                'Lark Parser Language Server is installed in the selected Python environment.'
            );
            return true;
        } catch {
            extensionLogger.error(
                'Lark Parser Language Server is not installed in the selected Python environment.'
            );
        }

        return false;
    }

    async isLarkLanguageServerVersionSupported(): Promise<boolean> {
        extensionLogger.log('Checking Lark Parser Language version...');

        const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/;
        const languageServerInfo = getLanguageServerInfo();
        const packageVersion = languageServerInfo?.package?.version;

        extensionLogger.log(
            `Minimum required Lark Parser Language Server version: ${packageVersion}`
        );

        let match = packageVersion.match(semverRegex);
        const [requiredMajor, requiredMinor, requiredPatch] = match
            ? [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)]
            : [0, 0, 0];

        try {
            const pythonPath = await this.getInterpreterPath();
            const version = execSync(
                `${pythonPath} -c "from lark_parser_language_server.version import VERSION; print('.'.join(VERSION))"`,
                { encoding: 'utf8' }
            ).trim();

            if (!version) {
                extensionLogger.error('Failed to retrieve Lark Parser Language Server version.');
                return false;
            }

            extensionLogger.log(`Detected Lark Parser Language Server version: ${version}`);

            const match = version.match(semverRegex);
            if (!match) {
                extensionLogger.error(
                    `Invalid Lark Parser Language Server version format: ${version}`
                );
                return false;
            }

            const major = parseInt(match[1], 10);
            const minor = parseInt(match[2], 10);
            const patch = parseInt(match[3], 10);

            if (major === requiredMajor && minor >= requiredMinor && patch >= requiredPatch) {
                extensionLogger.log(`Lark Parser Language Server version ${version} is supported.`);
                return true;
            }

            extensionLogger.error(
                `Lark Parser Language Server version ${version} is not supported.`
            );
        } catch {
            extensionLogger.error('Failed to retrieve Lark Parser Language Server version.');
        }

        return false;
    }

    async installLarkLanguageServer(): Promise<void> {
        const languageServerInfo = getLanguageServerInfo();
        const packageName = languageServerInfo?.package?.name || 'lark-parser-language-server';
        const packageVersion = languageServerInfo?.package?.version || 'latest';
        const packageSpecifier =
            packageVersion.toLowerCase() === 'latest'
                ? packageName
                : `${packageName}==${packageVersion}`;

        extensionLogger.log(
            `Installing ${packageName} (version: ${packageVersion}) using pip in the selected Python environment...`
        );

        const extensionRoot = this.context.extensionPath;
        const bundledEnvironmentPath = path.join(extensionRoot, 'bundled');
        const libsPath = path.join(bundledEnvironmentPath, 'libs');

        if (!fs.existsSync(bundledEnvironmentPath)) {
            extensionLogger.log('Creating bundled environment directory...');
            fs.mkdirSync(bundledEnvironmentPath, { recursive: true });
        }

        if (!fs.existsSync(libsPath)) {
            extensionLogger.log('Creating libs directory for bundled environment...');
            fs.mkdirSync(libsPath, { recursive: true });
        }

        extensionLogger.log(`Installing package: ${packageSpecifier}`);
        try {
            const pythonPath = await this.getInterpreterPath();
            execSync(
                `${pythonPath} -m pip install --target "${libsPath}" --upgrade ${packageSpecifier}`,
                {
                    stdio: 'inherit'
                }
            );
        } catch (error) {
            extensionLogger.error(`Failed to install package: ${packageSpecifier}`);
            extensionLogger.error(`Error: ${error}`);
        }

        extensionLogger.log('Creating entry point for Lark Parser Language Server...');
        const entryPointPath = path.join(bundledEnvironmentPath, 'entrypoint.py');
        const entryPointContent = `#! /usr/bin/env python3
import sys
import os
from pathlib import Path

bundled_dir = Path(__file__).parent
libs_dir = bundled_dir / 'libs'

sys.path.insert(0, str(libs_dir))
sys.path.insert(0, str(bundled_dir))

try:
    from lark_parser_language_server.__main__ import main
    main()
except ImportError:
    print("Lark Parser Language Server is not installed in this environment.")
    print("Please ensure that the package is installed correctly.")
    sys.exit(1)
`;

        fs.writeFileSync(entryPointPath, entryPointContent);
        fs.chmodSync(entryPointPath, 0o755);
    }

    async remove(): Promise<void> {
        const extensionRoot = this.context.extensionPath;
        const bundledEnvironmentPath = path.join(extensionRoot, 'bundled');

        if (fs.existsSync(bundledEnvironmentPath)) {
            extensionLogger.log('Removing bundled environment...');
            fs.rmSync(bundledEnvironmentPath, { recursive: true, force: true });
        }
    }
}
