# Code Collector

A VS Code extension that gathers code context for AI assistance by analyzing imports and collecting related files.

## Features

- **Smart Import Analysis**: Follows import chains to collect all related local files
- **Multi-Language Support**: TypeScript, JavaScript, Java, Kotlin, Python
- **Path Mapping Support**: Handles tsconfig.json aliases and path mappings
- **AI-Optimized Output**: Line numbers and file headers for easy AI consumption
- **Collect All**: Option to collect entire workspace with configurable ignore patterns

## Usage

### Code Collect (Import-based)
- **Keyboard**: `Ctrl+Shift+G` (`Cmd+Shift+G` on Mac)
- **Context Menu**: Right-click file(s) → "Code Collect"
- **Command Palette**: `Ctrl+Shift+P` → "Code Collect"

### Code Collect All
- **Context Menu**: Right-click in Explorer → "Code Collect All"
- **Command Palette**: `Ctrl+Shift+P` → "Code Collect All"

## Configuration

```json
{
 "codeCollector.ignorePatterns": [
   "node_modules/**",
   "dist/**",
   "build/**",
   "*.log"
 ]
}
```