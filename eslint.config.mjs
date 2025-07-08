import { fileURLToPath } from 'node:url';

import prettier from 'eslint-config-prettier';

import { includeIgnoreFile } from '@eslint/compat';
import ts from 'typescript-eslint';
import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default ts.config(
    includeIgnoreFile(gitignorePath),
    js.configs.recommended,
    ...ts.configs.recommended,
    prettier,
    {
        files: ['**/*.ts'],
        rules: {
            // Preffer over escaped characters
            'no-useless-escape': 'off'
        }
    },
    {
        plugins: {
            '@typescript-eslint': typescriptEslint
        },
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: { ...globals.node }
        },
        rules: {
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    selector: 'import',
                    format: ['camelCase', 'PascalCase']
                }
            ],

            curly: 'warn',
            eqeqeq: 'warn',
            'no-throw-literal': 'warn',
            semi: 'warn'
        }
    }
);
