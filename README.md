# Code Collector

A VS Code extension that gathers multi-file code context through import analysis for AI assistance. Automatically follows import chains to collect all related local files into a single, AI-friendly format.

## Features

- **Smart Import Analysis**: Uses TypeScript AST parsing to accurately detect all import types (ES6, dynamic imports, CommonJS require)
- **Multi-File Context**: Automatically follows import chains to gather all related local files
- **TypeScript & JavaScript Support**: Works with `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, and `.cjs` files
- **Path Mapping Support**: Handles `tsconfig.json` and `jsconfig.json` path mappings (e.g., `@/`, aliases)
- **Enhanced Resolution**: Uses webpack's battle-tested `enhanced-resolve` library for accurate module resolution
- **Duplicate Prevention**: Prevents circular imports and duplicate files in output
- **AI-Optimized Format**: Outputs code with line numbers and file headers for easy AI consumption

## Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "Code Collector"
4. Click Install

## Usage

### Command Palette

1. Open any TypeScript or JavaScript file
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Type "Code Collect"
4. Press Enter

### Context Menu

1. Right-click on any TypeScript or JavaScript file in the Explorer or Editor
2. Select "Code Collect"

### Keyboard Shortcut

- **Windows/Linux**: `Ctrl+Shift+G`
- **macOS**: `Cmd+Shift+G`

## Output Format

The extension copies collected context to your clipboard in this format:
