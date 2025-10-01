[![Community-Project][dynova-banner-community]][dynova-homepage]

[![Apache 2 License][badge-license]][repository] [![Lark][badge-language]][repository] [![Visual Studio Code][badge-tool]][repository]

# Lark for Visual Studio Code

This extension provides language support for Lark grammar files in Visual Studio Code.

![Lark Syntax Highlighting](https://github.com/dynovaio/lark-parser-vscode/raw/develop/images/_lark_sample.png)

Contributions are greatly appreciated.
Please fork this repository and open a pull request to make grammar tweaks, add support for other subgrammars etc.

## ✨ Features

-   ✅ **Syntax Highlighting**: Complete TextMate grammar for Lark files

    -   Rule definitions (lowercase identifiers)
    -   Terminal definitions (UPPERCASE identifiers)
    -   Directives (`%import`, `%ignore`, `%declare`, `%override`, `%extend`)
    -   Operators (`?`, `*`, `+`, `|`, `->`, `!`)
    -   Comments (`//`)
    -   Strings and regex literals
    -   Priority specifications (`.number`)

-   ✅ **Language Server Protocol (LSP)**: Full intellisense support

    -   **Diagnostics**: Real-time syntax error detection and validation
    -   **Code Completion**: Intelligent suggestions for rules, terminals, and keywords
    -   **Hover Information**: Documentation and symbol information on hover
    -   **Go to Definition**: Navigate to rule and terminal definitions
    -   **Find References**: Locate all usages of symbols across your grammar
    -   **Document Symbols**: Outline view showing all rules and terminals
    -   **Semantic Analysis**: Advanced grammar validation and error reporting

-   ✅ **Markdown Integration**: Lark code blocks in Markdown files
-   ✅ **Custom Icons**: Dedicated file icons for `.lark` files
-   ✅ **Configuration**: Customizable language server settings

## 📦 Installation

1. Open Visual Studio Code.
2. Go to the Extensions view by clicking on the Extensions icon in the Activity Bar on the side of the window or by pressing `Ctrl+Shift+X`.
3. Search for "Lark".
4. Click on the "Install" button for the extension named "Lark"
   [[↗][dynova.vscode-lark]] by Dynova [[↗][dynova-homepage]].
5. Once installed, you can start using Lark syntax highlighting and intellisense in your `.lark` files.

### Requirements

-   **Python 3.8+**: Required for the language server
-   **Poetry** (recommended): For Python dependency management

The extension will automatically try to find Python on your system. If you have a custom Python installation, you can configure the path in settings.

### Requirements

-   **Python 3.8+**: Required for the language server
-   **No additional setup required**: The extension includes a bundled Python environment with all dependencies

The extension automatically uses its bundled dependencies and doesn't require Poetry or a virtual environment setup. For development, Poetry is recommended but not required for end users.

### Configuration

Optional settings you can add to your `settings.json`:

```json
{
    "files.associations": {
        "*.lark": "lark"
    },
    "lark.server.enabled": true,
    "lark.server.path": "",
    "lark.trace.server": "off"
}
```

**Server Resolution Order:**

1. **Custom path**: If `lark.server.path` is configured, uses that executable
2. **Bundled server**: Uses the bundled Python environment (default and recommended)
3. **Poetry environment**: Falls back to Poetry if available (development mode)
4. **System Python**: Final fallback to system Python with source path## 🚀 Development

### Prerequisites

-   Node.js 16+
-   Python 3.8+
-   Poetry

### Setup

```bash
# Clone the repository
git clone https://github.com/dynovaio/lark-parser-vscode.git
cd lark-parser-vscode

# Install Node.js dependencies
npm install

# Install Python dependencies
poetry install

# Build the extension
npm run compile
```

### Running

1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. Open a `.lark` file to test the extension

### Architecture

This extension follows the Language Server Protocol (LSP) architecture:

-   **TypeScript Client** (`src/extension.ts`): VS Code extension that manages the language server
-   **Python Server** (`src/lark_language_server/`): LSP server providing language features
-   **Communication**: JSON-RPC over stdio between client and server

## Release Notes

All changes are listed in our [change log ↗][changelog].

## Contributing

Contributions are greatly appreciated.

Please fork this repository and open a pull request to make grammar tweaks, add support for other subgrammars etc.

## Contributors

See the list of contributors in our [contributors page ↗][contributors].

## License

This project is licensed under the terms of the Apache-2.0 license. See the
[LICENSE ↗][license] file.

## Disclaimer

The Lark Parser team already provides an extension for Visual Studio Code that
includes syntax highlighting as part of the
[Lark grammar syntax support ↗][dirk-thomas.vscode-lark] published in their
github organization [Lark Parser ↗][github-lark-parser], gently provided by
[Dirk Thomas][github-dirk-thomas].

This extension is based on the same grammar but is actively maintained
independently by [Dynova ↗][dynova-homepage] as an open source project.

[dynova-homepage]: https://dynova.io
[dynova-banner-community]: https://gitlab.com/softbutterfly/open-source/open-source-office/-/raw/master/assets/dynova/dynova-open-source--banner--community-project.png
[badge-license]: https://img.shields.io/badge/license-Apache%202.0-blue.svg?maxAge=2592000&style=flat-square
[badge-language]: https://img.shields.io/badge/Language-Lark-blue.svg?maxAge=2592000&style=flat-square
[badge-tool]: https://img.shields.io/badge/Tool-Visual%20Studio%20Code-blue.svg?maxAge=2592000&style=flat-square
[repository]: https://github.com/dynovaio/lark-parser-vscode
[dynova.vscode-lark]: https://marketplace.visualstudio.com/items?itemName=dynova.vscode-lark
[changelog]: https://github.com/dynovaio/lark-parser-vscode/blob/develop/CHANGELOG.md
[contributors]: https://github.com/dynovaio/lark-parser-vscode/graphs/contributors
[license]: https://github.com/dynovaio/lark-parser-vscode/blob/develop/LICENSE
[dirk-thomas.vscode-lark]: https://marketplace.visualstudio.com/items?itemName=dirk-thomas.vscode-lark
[github-lark-parser]: https://github.com/lark-parser/vscode-lark
[github-dirk-thomas]: https://github.com/dirk-thomas
