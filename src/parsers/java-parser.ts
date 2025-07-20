import { ImportInfo, ParserConfig } from "../types";
import { BaseParser } from "./base-parser";

export class JavaParser extends BaseParser {
  config: ParserConfig = {
    extensions: [".java"],
    name: "Java",
  };

  async parseImports(content: string, filePath: string): Promise<ImportInfo[]> {
    return this.parseImportStatements(content);
  }

  private parseImportStatements(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split("\n");

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Standard and static imports with optional wildcards
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
