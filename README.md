# Code Collector - VS Code Extension

**Gather your codebase context for AI assistants by following import dependencies.**

## Features

- **Smart Import Following**: Automatically collects files based on import statements
- **Multi-Language**: TypeScript, JavaScript, Java, Kotlin, Python
- **Two Modes**: 
  - Import-based collection (follows dependencies)
  - Collect entire workspace (with filtering)
- **AI-Ready Output**: Formatted with file paths and line numbers
- **One-Click Copy**: Results automatically copied to clipboard

## Usage

- **Keyboard**: `Ctrl+Shift+G` (`Cmd+Shift+G` on Mac)
- **Context Menu**: Right-click files/folders → "Code Collect"

## Output Format
```plaintext
// src/utils/helper.ts (L1-L25)
[your code here]
// src/main.ts (L26-L50)
[your code here]
```

Perfect for sharing code context with ChatGPT, Claude, and other AI assistants.