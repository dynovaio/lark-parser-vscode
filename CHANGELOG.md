# Change Log

## [Unreleased]

### Added

-   **New Views and Providers**: Introduced new Lark views and provider infrastructure
    -   Generic `LarkTreeDataProvider` used to build view-specific providers
    -   `LarkTerminalProvider` and `LarkRuleProvider` for the Terminals and Rules views
    -   View container and view contributions for better workspace visibility
    -   Icons for terminal and rule views
-   **New Commands & Registration Improvements**: Better command isolation and new actions
    -   Isolated command registration and improved command wiring in the extension
    -   `revealRange` command and support for passing command args to terminal/rule items

### Changed

-   **Language Server Client & Python environment**: refactors and reliability improvements
    -   Refactored language server client initialization and Python environment handling
    -   Correct assignment of `useExtensionBundle` during client initialization
    -   Added constants for python environment handling
-   **Configuration and naming updates**
    -   Renamed setting `lark.trace.server` to `lark.server.trace` for clarity
    -   Renamed `language-configuration.json` to `lark.configuration.json` and updated icon/file names
    -   Updated `contributes` to include view containers and views

### Fixed

-   **Views and UI fixes**
    -   Corrected handling of Rules and Terminals views when the active editor changes
    -   Fixed various text references to the Lark Parser Language Server across the codebase
-   **Build & lint fixes**
    -   Fixed lint errors caused by `strict` changes and adjusted `tsconfig` (added `skipLibCheck`)

### Technical Improvements

-   Continued refactoring for maintainability: moved disposables initialization to `disposables.ts`, reorganized providers and extension classes
-   Small UX and developer experience improvements: activation log confirmation and other debugging/logging enhancements

## [0.3.0] - 2025-10-22

### Added

-   **New Extension Commands**: Enhanced user control and troubleshooting capabilities
    -   `Lark: Remove Bundled Environment` - Command to clean up bundled Python dependencies for fresh installations
-   **Virtual Workspace Support**: Improved compatibility with VS Code virtual workspaces
    -   Dynamic document selector configuration based on workspace type
    -   Support for virtual file schemes beyond local file system
-   **Enhanced Logging System**: Improved debugging and troubleshooting capabilities
    -   Enhanced logging for Python interpreter detection and validation
    -   Better error reporting for executable Python detection processes

### Changed

-   **Language Server Dependency**: Updated to Lark Parser Language Server v0.3.0
    -   Improved language server capabilities and performance
    -   Enhanced formatting and code intelligence features
-   **Extension Categories**: Added "Formatters" category to better reflect extension capabilities
    -   Extension now properly categorized for document formatting features
    -   Improved discoverability in VS Code marketplace
-   **Document Selector Logic**: Intelligent workspace-aware document handling
    -   Automatic detection of virtual vs file-based workspaces
    -   Optimized file scheme support for different workspace types

### Technical Improvements

-   **Workspace Detection**: New utility functions for workspace type identification
    -   `isVirtualWorkspace()` function for detecting virtual workspace environments
    -   `getDocumentSelector()` utility for dynamic document selector configuration
-   **Python Environment Management**: Enhanced bundled environment handling
    -   Ability to remove and reinstall bundled Python dependencies
    -   Improved error handling during Python interpreter detection
-   **Code Organization**: New utility modules for better code maintainability
    -   `src/utils.ts` - Common utility functions
    -   Enhanced workspace management in `src/workspace.ts`

## [0.2.0] - 2025-10-04

### Added

-   **Language Server Protocol (LSP) support**: Full implementation of Lark Parser Language Server for enhanced code intelligence
    -   Bundled Lark Parser Language Server (v0.2.0) for out-of-the-box functionality
    -   Configurable language server settings with custom Python path support
    -   Language server trace options for debugging
-   **Extension commands**: New VS Code commands for better user experience
    -   `Lark: Show Logs` - View extension and language server logs
    -   `Lark: Restart Language Server` - Restart the language server when needed
-   **Modern build system**: Complete development infrastructure overhaul
    -   ESBuild configuration for fast TypeScript compilation and bundling
    -   ESLint configuration with TypeScript support
    -   Watch mode for development with parallel compilation
    -   Automated bundling of Python dependencies
-   **Extension architecture**: Modular TypeScript codebase
    -   Separate modules for extension activation, language server management, logging, and settings
    -   Python interpreter detection and management
    -   Workspace configuration handling
-   **Testing framework**: Initial test setup with VS Code test runner
-   **Dependency management**: Updated to modern tooling
    -   VS Code Python extension integration
    -   Language client for LSP communication
    -   Support for Node.js 22.17.0+
    -   VS Code engine requirement updated to 1.93.0+

### Changed

-   **Repository ownership**: Migrated from `lark-parser/vscode-lark` to `dynovaio/lark-parser-vscode`
-   **Project structure**: Reorganized extension files and source code layout
-   **Development workflow**: Enhanced contributing guidelines with updated Node.js requirements
-   **Configuration**: Updated editor configuration and IDE settings
-   **Documentation**: Refreshed README.md with new repository references and sample images

### Technical Improvements

-   **Build optimization**: Production-ready bundling with tree-shaking
-   **Type safety**: Full TypeScript implementation with strict type checking
-   **Code quality**: ESLint integration for consistent code style
-   **Development experience**: Hot reload support and improved debugging capabilities

## [0.1.0] - 2025-09-27

-   Add icon for Lark language files (initially by @TheVroum).
-   Add extension icon for the vscode marketplace.
-   Add support for codesnippets in markdown files.
-   Initial development by @dirk-thomas
-   Support for Lark language.
