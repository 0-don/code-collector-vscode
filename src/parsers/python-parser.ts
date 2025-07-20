import { ImportInfo, ParserConfig } from "../types";
import { BaseParser } from "./base-parser";

export class PythonParser extends BaseParser {
  config: ParserConfig = {
    extensions: [".py"],
    name: "Python",
  };

  async parseImports(content: string, filePath: string): Promise<ImportInfo[]> {
    const imports: ImportInfo[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and comments
      if (!line || line.startsWith("#")) {
        continue;
      }

      // Standard import: import module
      const importMatch = line.match(/^import\s+([^\s#]+)/);
      if (importMatch) {
        imports.push({
          module: importMatch[1],
          type: "import",
          line: i + 1,
        });
        continue;
      }

      // From import: from module import ...
      const fromMatch = line.match(/^from\s+([^\s#]+)\s+import/);
      if (fromMatch) {
        imports.push({
          module: fromMatch[1],
          type: "from",
          line: i + 1,
        });
        continue;
      }

      // Stop at first non-import statement (basic version)
      if (
        line &&
        !line.startsWith("from ") &&
        !line.startsWith("import ") &&
        !line.startsWith('"') &&
        !line.startsWith("'") &&
        !line.startsWith("@") &&
        !line.startsWith("if __name__")
      ) {
        break;
      }
    }

    return imports;
  }
}
