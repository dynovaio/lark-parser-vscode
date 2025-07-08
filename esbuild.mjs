import { context } from 'esbuild';
import { resolve } from 'path';
import * as fs from 'fs';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                console.error(`    ${location.file}:${location.line}:${location.column}:`);
            });
            console.log('[watch] build finished');
        });
    }
};

/**
 * @type {import('esbuild').Plugin}
 */
const aliasPlugin = {
    name: 'alias',
    setup(build) {
        // Resolve @ to src directory
        build.onResolve({ filter: /^@\// }, (args) => {
            const resolvedPath = resolve(__dirname, 'src', args.path.slice(2));
            // Try different extensions if the file doesn't exist
            const extensions = ['.ts', '.js', '.tsx', '.jsx'];

            // First try the exact path
            if (fs.existsSync(resolvedPath)) {
                return { path: resolvedPath };
            }

            // Try with extensions
            for (const ext of extensions) {
                const pathWithExt = resolvedPath + ext;
                if (fs.existsSync(pathWithExt)) {
                    return { path: pathWithExt };
                }
            }

            // Fallback to the original path (let esbuild handle the error)
            return { path: resolvedPath };
        });
    }
};

async function main() {
    const ctx = await context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [
            aliasPlugin,
            /* add to the end of plugins array */
            esbuildProblemMatcherPlugin
        ]
    });
    if (watch) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
