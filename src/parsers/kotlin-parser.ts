import { ImportInfo, ParserConfig } from "../types";
import { BaseParser } from "./base-parser";

export class KotlinParser extends BaseParser {
  config: ParserConfig = {
    extensions: [".kt"],
    name: "Kotlin",
  };

  async parseImports(content: string, filePath: string): Promise<ImportInfo[]> {
    return this.parseImportStatements(content);
  }

  private parseImportStatements(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and comments
      if (!line || line.startsWith("//") || line.startsWith("/*")) {
        continue;
      }

      // Parse import statements
      if (line.startsWith("import ")) {
        const importInfo = this.parseImportLine(line, i + 1);
        if (importInfo) {
          imports.push(importInfo);
        }
      }

      // Stop after we've seen actual code (not package/imports/annotations)
      if (
        line &&
        !line.startsWith("package ") &&
        !line.startsWith("import ") &&
        !line.startsWith("@") &&
        !line.startsWith("/*") &&
        !line.startsWith("*") &&
        !line.endsWith("*/")
      ) {
        // We've hit actual code, stop looking for imports
        break;
      }
    }

    return imports;
  }

  private parseImportLine(line: string, lineNumber: number): ImportInfo | null {
    // Remove 'import ' prefix and any trailing semicolon or whitespace
    let importPath = line.replace(/^import\s+/, "").replace(/[;\s]*$/, "");

    // Handle aliased imports (import foo.Bar as Baz)
    const aliasMatch = importPath.match(/^(.+?)\s+as\s+\w+$/);
    if (aliasMatch) {
      importPath = aliasMatch[1];
    }

    // Validate the import path
    if (this.isValidKotlinImport(importPath)) {
      return {
        module: importPath,
        type: "import",
        line: lineNumber,
      };
    }

    return null;
  }

  private isValidKotlinImport(importPath: string): boolean {
    // Basic validation for Kotlin import paths
    // Should be a valid package/class name or wildcard
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*(\.\*)?$/.test(
      importPath,
    );
  }
}
