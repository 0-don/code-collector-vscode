import { ImportInfo, ParserConfig } from "../types";
import { BaseParser } from "./base-parser";

export class JavaParser extends BaseParser {
  config: ParserConfig = {
    extensions: [".java"],
    name: "Java",
  };

  async parseImports(content: string, filePath: string): Promise<ImportInfo[]> {
    const imports: ImportInfo[] = [];

    try {
      // Dynamic import to handle ESM module
      const { parse } = await import("java-parser");
      const cst = parse(content) as any; // Cast to any to bypass typing issues

      // Now we can safely access children
      const cu = cst.children?.compilationUnit?.[0];

      if (cu?.children?.importDeclaration) {
        cu.children.importDeclaration.forEach((importDecl: any) => {
          const importInfo = this.extractImportInfo(importDecl, content);
          if (importInfo) {
            imports.push(importInfo);
          }
        });
      }
    } catch (error) {
      console.log(`Failed to parse Java file ${filePath}:`, error);
      // Fallback to regex parsing if AST fails
      return this.fallbackRegexParsing(content);
    }

    return imports;
  }

  private extractImportInfo(
    importDecl: any,
    content: string
  ): ImportInfo | null {
    try {
      // Get the import name
      let importName = "";

      if (importDecl.children?.packageOrTypeName) {
        const packageOrTypeName = importDecl.children.packageOrTypeName[0];
        importName = this.extractPackageOrTypeName(packageOrTypeName);
      }

      // Check for wildcard import
      if (importDecl.children?.Star) {
        importName += ".*";
      }

      if (!importName) {
        return null;
      }

      // Calculate line number
      const line = this.getLineNumber(importDecl, content);

      return {
        module: importName,
        type: "import",
        line,
      };
    } catch (error) {
      console.log("Error extracting import info:", error);
      return null;
    }
  }

  private extractPackageOrTypeName(packageOrTypeName: any): string {
    let name = "";

    if (packageOrTypeName?.children) {
      if (packageOrTypeName.children.Identifier) {
        name = packageOrTypeName.children.Identifier[0].image;
      } else if (
        packageOrTypeName.children.packageOrTypeName &&
        packageOrTypeName.children.Identifier
      ) {
        const parentName = this.extractPackageOrTypeName(
          packageOrTypeName.children.packageOrTypeName[0]
        );
        const identifier = packageOrTypeName.children.Identifier[0].image;
        name = `${parentName}.${identifier}`;
      }
    }

    return name;
  }

  private getLineNumber(node: any, content: string): number {
    try {
      if (node.location?.startLine) {
        return node.location.startLine;
      }

      // Fallback: find the import keyword position
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith("import ")) {
          return i + 1;
        }
      }

      return 1;
    } catch {
      return 1;
    }
  }

  private fallbackRegexParsing(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split("\n");

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Standard imports
      const importMatch = trimmed.match(
        /^import\s+(?:static\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*(?:\.\*)?)\s*;/
      );
      if (importMatch) {
        imports.push({
          module: importMatch[1],
          type: "import",
          line: index + 1,
        });
      }
    });

    return imports;
  }
}
