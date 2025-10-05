# How to contribute to this project

> If you are interested in contributing to the development and maintenance of
> this package, it is recommended that you use [nvm] for node version
> management.

## 🚀 Development

### Prerequisites

-   Node.js 22+

### Setup

```bash
# Clone the repository
git clone https://github.com/dynovaio/lark-parser-vscode.git
cd lark-parser-vscode

# Install Node.js dependencies
npm install

# Build the extension
npm run compile
```

### Running

1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. Open a `.lark` file to test the extension

### Architecture

This extension follows the Language Server Protocol (LSP) architecture:

-   **TypeScript Client** (`src/extension.ts`): VS Code extension that manages
    the language server
-   **Python Server** (`lark_parser_language_server`): Implements LSP features
-   **Communication**: JSON-RPC over stdio between client and server

The server is installed automatically by the extension and does not require
manual setup for end users. The language server is provided by the
[`lark-parser-language-server` ↗][github-lark-parser-language-server] package
developed by [Dynova ↗][dynova-homepage].

## Code of Conduct

> Please note that this project is published with a Code of Conduct for
> collaborators. By participating in this project, you agree to abide by its
> terms.

[nvm]: https://github.com/nvm-sh/nvm
[dynova-homepage]: https://dynova.io
[dynova-banner-community]: https://gitlab.com/softbutterfly/open-source/open-source-office/-/raw/master/assets/dynova/dynova-open-source--banner--community-project.png
[badge-license]: https://img.shields.io/badge/license-Apache%202.0-blue.svg?maxAge=2592000&style=flat-square
[badge-language]: https://img.shields.io/badge/Language-Lark-blue.svg?maxAge=2592000&style=flat-square
[badge-tool]: https://img.shields.io/badge/Tool-Visual%20Studio%20Code-blue.svg?maxAge=2592000&style=flat-square
[repository]: https://github.com/dynovaio/lark-parser-vscode
[repository-example]: https://github.com/dynovaio/lark-parser-vscode/raw/develop/images/_lark_sample.png
[repository-example-2]: https://github.com/dynovaio/lark-parser-vscode/raw/develop/images/_lark_sample_3.png
[dynova.vscode-lark]: https://marketplace.visualstudio.com/items?itemName=dynova.vscode-lark
[contributing]: https://github.com/dynovaio/lark-parser-vscode/blob/develop/CONTRIBUTING.md
[changelog]: https://github.com/dynovaio/lark-parser-vscode/blob/develop/CHANGELOG.md
[contributors]: https://github.com/dynovaio/lark-parser-vscode/graphs/contributors
[license]: https://github.com/dynovaio/lark-parser-vscode/blob/develop/LICENSE
[dirk-thomas.vscode-lark]: https://marketplace.visualstudio.com/items?itemName=dirk-thomas.vscode-lark
[github-lark-parser]: https://github.com/lark-parser/vscode-lark
[github-dirk-thomas]: https://github.com/dirk-thomas
[github-lark-parser-language-server]: https://github.com/dynovaio/lark-parser-language-server
