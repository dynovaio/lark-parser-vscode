![Community-Project](https://gitlab.com/softbutterfly/open-source/open-source-office/-/raw/master/assets/dynova/dynova-open-source--banner--community-project.png)
[![Apache 2 License][badge-license]][repository] [![Lark][badge-language]][repository] [![Visual Studio Code][badge-tool]][repository]

# Lark for Visual Studio Code

This extension provides language support for Lark grammar files in Visual Studio Code.

![Lark Syntax Highlighting](https://github.com/dynovaio/lark-parser-vscode/raw/develop/images/_lark_sample.png)

Contributions are greatly appreciated.
Please fork this repository and open a pull request to make grammar tweaks, add support for other subgrammars etc.

## ✨ Features

- ✅ Syntax highlighting for:
    - Rule definition
    - Terminal definition
    - Directives
    - Operators
    - Comments (`//`)
    - Strings (quoted & backticked)
- ✅ Markdown embedding support
- ✅ Custom file icon for `.lark` files

## 📦 Installation

1. Open Visual Studio Code.
2. Go to the Extensions view by clicking on the Extensions icon in the Activity Bar on the side of the window or by pressing `Ctrl+Shift+X`.
3. Search for "Lark".
4. Click on the "Install" button for the extension named "Lark"
   [[↗][dynova.vscode-lark]] by Dynova [[↗][dynova-homepage]].
5. Once installed, you can start using Lark syntax highlighting in your `.lark` files.
6. Optionally, you can set the default language for `.lark` files by adding the following to your `settings.json`:

```json
"files.associations": {
    "*.lark": "lark"
}
```

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

[badge-license]: https://img.shields.io/badge/license-Apache%202.0-blue.svg?maxAge=2592000&style=flat-square
[badge-language]: https://img.shields.io/badge/Language-Lark-blue.svg?maxAge=2592000&style=flat-square
[badge-tool]: https://img.shields.io/badge/Tool-Visual%20Studio%20Code-blue.svg?maxAge=2592000&style=flat-square
[repository]: https://github.com/dynovaio/lark-parser-vscode
[dynova.vscode-lark]: https://marketplace.visualstudio.com/items?itemName=dynova.vscode-lark
[dynova-homepage]: https://dynova.io
[changelog]: https://github.com/dynovaio/lark-parser-vscode/blob/develop/CHANGELOG.md
[contributors]: https://github.com/dynovaio/lark-parser-vscode/graphs/contributors
[license]: https://github.com/dynovaio/lark-parser-vscode/blob/develop/LICENSE
[dirk-thomas.vscode-lark]: https://marketplace.visualstudio.com/items?itemName=dirk-thomas.vscode-lark
[github-lark-parser]: https://github.com/lark-parser/vscode-lark
[github-dirk-thomas]: https://github.com/dirk-thomas
