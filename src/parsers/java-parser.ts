import { ImportInfo, ParserConfig } from "../types";
import { BaseParser } from "./base-parser";

export class JavaParser extends BaseParser {
  config: ParserConfig = {
    extensions: [".java"],
    name: "Java",
  };

  parseImports(content: string, filePath: string): ImportInfo[] {
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
