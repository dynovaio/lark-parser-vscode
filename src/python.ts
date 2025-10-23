import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { ExtensionContext, Uri, workspace, extensions } from 'vscode';
import { PythonExtension } from '@vscode/python-extension';

import { extensionLogger } from './logger';
import { PYTHON_VERSION, PYTHON_MAJOR, PYTHON_MINOR } from './constants';
import { getLanguageServerInfo } from './settings';

export interface IInterpreterDetails {
    path?: string;
    resource?: Uri;
}

let _api: PythonExtension | undefined;

export function isPythonExtensionEnabled(): boolean {
    const pythonExtension = extensions.getExtension('ms-python.python');
    return pythonExtension !== undefined && pythonExtension.isActive;
}

export async function getPythonExtensionAPI(): Promise<PythonExtension | undefined> {
    if (_api) {
        return _api;
    }

    // Check if Python extension is installed and active
    if (!isPythonExtensionEnabled()) {
        extensionLogger.log('Python extension is not installed or not active.');
        return undefined;
    }

    try {
        // Add a timeout to prevent infinite waiting
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout getting Python extension API')), 5000);
        });

        _api = await Promise.race([PythonExtension.api(), timeoutPromise]);

        return _api;
    } catch (error) {
        extensionLogger.error(`Failed to get Python extension API: ${error}`);
        return undefined;
    }
}

export async function getPythonInterpreterFromLarkExtensionSettings(): Promise<string | undefined> {
    extensionLogger.log('Checking Lark extension settings for pythonPath...');
    const config = workspace.getConfiguration('lark');
    const customPythonPath = config.get<string>('server.pythonPath');

    if (customPythonPath) {
        extensionLogger.log(`Using custom pythonPath from Lark settings: ${customPythonPath}`);
        return customPythonPath;
    }

    extensionLogger.error('No custom pythonPath set in Lark extension settings.');
    return undefined;
}

export async function getPythonInterpreterFromPythonExtensionAPI(): Promise<string | undefined> {
    extensionLogger.log('Checking Python extension for active interpreter...');

    if (!isPythonExtensionEnabled()) {
        extensionLogger.log('Python extension is not available, skipping...');
        return undefined;
    }

    const api = await getPythonExtensionAPI();
    if (!api) {
        extensionLogger.error('Python extension API is not available.');
        return undefined;
    }

    try {
        const environment = await api.environments.resolveEnvironment(
            api.environments.getActiveEnvironmentPath()
        );

        if (!environment) {
            extensionLogger.error('No active Python environment found in Python extension.');
            return undefined;
        }

        extensionLogger.log(
            `Using Python interpreter from Python extension: ${environment.executable.uri.fsPath}`
        );
        return environment.executable.uri.fsPath;
    } catch (error) {
        extensionLogger.error(`Error getting Python interpreter from extension: ${error}`);
        return undefined;
    }
}

export async function getPythonInterpreterFromSystemPath(): Promise<string | undefined> {
    extensionLogger.log('Checking system PATH for python executable...');
    const candidates = ['python3', 'python'];

    for (const candidate of candidates) {
        try {
            const result = execSync(`${candidate} --version`, {
                encoding: 'utf8'
            });
            if (result.startsWith('Python')) {
                return candidate;
            }
        } catch {
            extensionLogger.error(
                `No suitable Python interpreter found for candidate: ${candidate}`
            );
        }
    }

    extensionLogger.error('No suitable Python interpreter found in system PATH.');
    return undefined;
}

export async function getPythonInterpreter(resource?: Uri): Promise<IInterpreterDetails> {
    extensionLogger.log('Resolving Python interpreter details...');

    // Check custom path in Lark extension settings first
    let pythonInterpreterPath = await getPythonInterpreterFromLarkExtensionSettings();
    if (pythonInterpreterPath && isSupportedPythonVersion(pythonInterpreterPath)) {
        return { path: pythonInterpreterPath, resource };
    }

    // Check Python extension API next
    pythonInterpreterPath = await getPythonInterpreterFromPythonExtensionAPI();
    if (pythonInterpreterPath && isSupportedPythonVersion(pythonInterpreterPath)) {
        return { path: pythonInterpreterPath, resource };
    }

    // Finally, check system PATH
    pythonInterpreterPath = await getPythonInterpreterFromSystemPath();
    if (pythonInterpreterPath && isSupportedPythonVersion(pythonInterpreterPath)) {
        return { path: pythonInterpreterPath, resource };
    }

    throw new Error('No suitable Python interpreter found. Please install Python 3.9 or above.');
}

export function isSupportedPythonVersion(pythonPath: string | undefined): boolean {
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

    extensionLogger.error(`Python version ${version?.major}.${version?.minor} is not supported.`);
    extensionLogger.error(`Selected python path: ${pythonPath}`);
    extensionLogger.error(`Supported versions are ${PYTHON_VERSION} and above.`);
    return false;
}

export function isLarkParserLanguageServerInstalled(pythonPath: string): boolean {
    try {
        const result = execSync(`${pythonPath} -c "import lark_parser_language_server"`, {
            encoding: 'utf8'
        });
        extensionLogger.log(
            'Lark Parser Language Server is installed in the selected Python environment.'
        );
        extensionLogger.log(`Import result: ${result}`);

        return true;
    } catch {
        extensionLogger.error(
            'Lark Parser Language Server is not installed in the selected Python environment.'
        );
    }

    return false;
}

export function isSupportedLarkParserLanguageServerVersion(pythonPath: string): boolean {
    extensionLogger.log('Checking Lark Parser Language Server version...');

    const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/;
    const languageServerInfo = getLanguageServerInfo();
    const packageVersion = languageServerInfo?.package?.version;

    extensionLogger.log(`Minimum required Lark Parser Language Server version: ${packageVersion}`);

    let match = packageVersion.match(semverRegex);
    const [requiredMajor, requiredMinor, requiredPatch] = match
        ? [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)]
        : [0, 0, 0];

    try {
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
            extensionLogger.error(`Invalid Lark Parser Language Server version format: ${version}`);
            return false;
        }

        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        const patch = parseInt(match[3], 10);

        if (major === requiredMajor && minor >= requiredMinor && patch >= requiredPatch) {
            extensionLogger.log(`Lark Parser Language Server version ${version} is supported.`);
            return true;
        }

        extensionLogger.error(`Lark Parser Language Server version ${version} is not supported.`);
    } catch {
        extensionLogger.error('Failed to retrieve Lark Parser Language Server version.');
    }

    return false;
}

export async function installLarkParserLanguageServer(
    pythonPath: string,
    context: ExtensionContext
): Promise<void> {
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

    const extensionRoot = context.extensionPath;
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

export function removeBundledEnvironment(context: ExtensionContext): void {
    const extensionRoot = context.extensionPath;
    const bundledEnvironmentPath = path.join(extensionRoot, 'bundled');

    if (fs.existsSync(bundledEnvironmentPath)) {
        extensionLogger.log('Removing bundled environment...');
        fs.rmSync(bundledEnvironmentPath, { recursive: true, force: true });
    }
}
