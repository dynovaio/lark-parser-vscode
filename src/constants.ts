import * as path from 'path';
import * as fs from 'fs';

const folderName = path.basename(__dirname);
const isLocalEnvironment = folderName === 'src';

export const ROOT_DIR = isLocalEnvironment ? path.dirname(__dirname) : path.dirname(__dirname);
export const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
export const PACKAGE_JSON = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
export const EXTENSION_ID = `${PACKAGE_JSON.publisher}.${PACKAGE_JSON.name}`;
export const LANGUAGE_SERVER_RESTART_DELAY = 1000;

// Python related settings
export const PYTHON_MAJOR = 3;
export const PYTHON_MINOR = 9;
export const PYTHON_VERSION = `${PYTHON_MAJOR}.${PYTHON_MINOR}`;

export const PYTHON_BUNDLED_DIR = path.join(ROOT_DIR, 'bundled');

export const PYTHON_CANDIDATES = ['python3', 'python'];

export const PYTHON_EXTENSION_ID = 'ms-python.python';
export const PYTHON_EXTENSION_TIMEOUT = 5000;
