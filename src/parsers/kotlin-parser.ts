import Parser from "tree-sitter";
import Kotlin from "tree-sitter-kotlin";
import { ImportInfo, ParserConfig } from "../types";
import { BaseParser } from "./base-parser";

export class KotlinParser extends BaseParser {
  config: ParserConfig = {
    extensions: [".kt"],
    name: "Kotlin",
  };

  async parseImports(content: string, filePath: string): Promise<ImportInfo[]> {
    try {
      const parser = new Parser();
      parser.setLanguage(Kotlin as any);

      const tree = parser.parse(content);
      const imports = this.extractImportsFromAST(tree, content);

      // If we got imports from AST, return them
      if (imports.length > 0) {
        return imports;
      }
    } catch (error) {
      console.log(
        `AST parsing failed for ${filePath}, using structured fallback:`,
        error
      );
    }

    // Always fall back to structured parsing (no regex)
    return this.fallbackStructuredParsing(content);
  }

  private extractImportsFromAST(tree: any, content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    const visitNode = (node: any) => {
      // Look for import_header nodes in the AST
      if (node.type === "import_header") {
        const importInfo = this.extractImportFromNode(node, content);
        if (importInfo) {
          imports.push(importInfo);
        }
      }

      // Recursively visit child nodes
      if (node.children) {
        for (const child of node.children) {
          visitNode(child);
        }
      }
    };

    visitNode(tree.rootNode);
    return imports;
  }

  private extractImportFromNode(node: any, content: string): ImportInfo | null {
    try {
      // Get the import statement text
      const importText = content.slice(node.startIndex, node.endIndex);

      // Extract the module path from the import statement
      let modulePath = "";

      // Look for identifier nodes within the import
      const findIdentifiers = (n: any): string[] => {
        if (n.type === "identifier") {
          return [content.slice(n.startIndex, n.endIndex)];
        }

        if (n.children) {
          return n.children.flatMap(findIdentifiers);
        }

        return [];
      };

      const identifiers = findIdentifiers(node);
      if (identifiers.length > 0) {
        modulePath = identifiers.join(".");
      }

      // Fallback: parse the text directly if AST extraction fails
      if (!modulePath) {
        modulePath = this.extractModuleFromText(importText);
      }

      if (!modulePath) {
        return null;
      }

      // Calculate line number
      const line = this.getLineNumber(node, content);

      return {
        module: modulePath,
        type: "import",
        line,
      };
    } catch (error) {
      console.log("Error extracting import from AST node:", error);
      return null;
    }
  }

  private extractModuleFromText(importText: string): string {
    // Remove 'import' keyword and whitespace
    const cleaned = importText.replace(/^import\s+/, "").trim();

    // Handle aliased imports (import foo.Bar as Baz)
    const aliasMatch = cleaned.match(/^(.+?)\s+as\s+\w+/);
    if (aliasMatch) {
      return aliasMatch[1];
    }

    // Return the module path
    return cleaned;
  }

  private getLineNumber(node: any, content: string): number {
    try {
      if (node.startPosition?.row !== undefined) {
        return node.startPosition.row + 1;
      }

      // Fallback: calculate line number from byte position
      const lines = content.slice(0, node.startIndex).split("\n");
      return lines.length;
    } catch {
      return 1;
    }
  }

  private fallbackStructuredParsing(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and comments
      if (!line || line.startsWith("//") || line.startsWith("/*")) {
        continue;
      }

      // Stop at package declaration or first non-import code
      if (
        line.startsWith("package ") ||
        (line &&
          !line.startsWith("import ") &&
          !line.startsWith("@") &&
          !line.startsWith("/*"))
      ) {
        break;
      }

      // Parse import statements
      if (line.startsWith("import ")) {
        const importInfo = this.parseImportLine(line, i + 1);
        if (importInfo) {
          imports.push(importInfo);
        }
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
      importPath
    );
  }
}
