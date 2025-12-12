import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as util from "util";
import { ImportInfo, ParserConfig } from "../types";
import { BaseParser } from "./base-parser";

const execFileP = util.promisify(execFile);

const HELPER_PYTHON_CONTENT = `import ast
import json
import sys
import os

def extract_imports_from_file(file_path):
    """Extract all imports from a Python file"""
    if not os.path.isfile(file_path) or not file_path.endswith('.py'):
        return []
    
    imports = []
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            tree = ast.parse(f.read())
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append({
                        'module': alias.name,
                        'type': 'import',
                        'line': node.lineno
                    })
            
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imports.append({
                        'module': node.module,
                        'type': 'from',
                        'line': node.lineno,
                        'level': node.level
                    })
    
    except (SyntaxError, UnicodeDecodeError):
        pass
    
    return imports

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps([]))
        sys.exit(0)
    
    try:
        file_path = sys.argv[1]
        imports = extract_imports_from_file(file_path)
        print(json.dumps(imports))
    except Exception:
        print(json.dumps([]))
`;

export class PythonParser extends BaseParser {
  config: ParserConfig = {
    extensions: [".py"],
    name: "Python",
  };

  private helperPath: string | null = null;

  async parseImports(content: string, filePath: string): Promise<ImportInfo[]> {
    const helperPath = await this.ensureHelperExists();
    if (!helperPath) {
      return this.parseImportsFallback(content);
    }

    try {
      const { stdout } = await execFileP("python", [helperPath, filePath]);
      const result = JSON.parse(stdout) || [];
      return result.map((imp: any) => ({
        module: imp.module,
        type: imp.type,
        line: imp.line,
      }));
    } catch (error) {
      return this.parseImportsFallback(content);
    }
  }

  private parseImportsFallback(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      const importMatch = line.match(/^import\s+([^\s#]+)/);
      if (importMatch) {
        imports.push({
          module: importMatch[1],
          type: "import",
          line: i + 1,
        });
        continue;
      }

      const fromMatch = line.match(/^from\s+([^\s#]+)\s+import/);
      if (fromMatch) {
        imports.push({
          module: fromMatch[1],
          type: "from",
          line: i + 1,
        });
        continue;
      }

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

  private async ensureHelperExists(): Promise<string | null> {
    if (this.helperPath && fs.existsSync(this.helperPath)) {
      return this.helperPath;
    }

    try {
      const tempDir = os.tmpdir();
      this.helperPath = path.join(tempDir, "code-collector-python-helper.py");
      fs.writeFileSync(this.helperPath, HELPER_PYTHON_CONTENT, "utf8");
      return this.helperPath;
    } catch (error) {
      return null;
    }
  }
}
