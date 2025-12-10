import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as util from "util";
import { pythonExtensions } from "../languages";
import { ResolverConfig } from "../types";
import { BaseResolver } from "./base-resolver";

const execFileP = util.promisify(execFile);

const HELPER_PYTHON_CONTENT = `import ast
import json
import sys
import os

def is_local_import(module_name, search_paths):
    """Check if module exists in local search paths"""
    if not module_name:
        return False
    
    module_parts = module_name.split('.')
    
    for search_path in search_paths:
        # Try as module file
        module_file = os.path.join(search_path, *module_parts) + '.py'
        if os.path.isfile(module_file):
            return True
        
        # Try as package
        package_init = os.path.join(search_path, *module_parts, '__init__.py')
        if os.path.isfile(package_init):
            return True
    
    return False

def resolve_import_path(module_name, search_paths):
    """Resolve import to absolute file path"""
    if not module_name:
        return None
    
    module_parts = module_name.split('.')
    
    for search_path in search_paths:
        # Try as module file
        module_file = os.path.join(search_path, *module_parts) + '.py'
        if os.path.isfile(module_file):
            return os.path.abspath(module_file)
        
        # Try as package
        package_init = os.path.join(search_path, *module_parts, '__init__.py')
        if os.path.isfile(package_init):
            return os.path.abspath(package_init)
    
    return None

def should_ignore(file_path, patterns):
    """Check if file should be ignored based on patterns"""
    for pattern in patterns:
        if pattern in file_path:
            return True
    return False

def extract_imports_from_file(file_path, search_paths, ignore_patterns, processed_files):
    """Extract local imports from a Python file"""
    if file_path in processed_files or should_ignore(file_path, ignore_patterns):
        return []
        
    if not os.path.isfile(file_path) or not file_path.endswith('.py'):
        return []
        
    processed_files.add(file_path)
    current_dir = os.path.dirname(os.path.abspath(file_path))
    local_search_paths = [current_dir] + search_paths
    found_imports = []
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            tree = ast.parse(f.read())
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if is_local_import(alias.name, local_search_paths):
                        path = resolve_import_path(alias.name, local_search_paths)
                        if path and not should_ignore(path, ignore_patterns):
                            found_imports.append(path)
            
            elif isinstance(node, ast.ImportFrom):
                if node.level == 0 and node.module:  # Absolute import
                    if is_local_import(node.module, local_search_paths):
                        path = resolve_import_path(node.module, local_search_paths)
                        if path and not should_ignore(path, ignore_patterns):
                            found_imports.append(path)
                elif node.level > 0:  # Relative import
                    relative_dir = current_dir
                    for _ in range(node.level - 1):
                        relative_dir = os.path.dirname(relative_dir)
                    
                    if node.module and is_local_import(node.module, [relative_dir]):
                        path = resolve_import_path(node.module, [relative_dir])
                        if path and not should_ignore(path, ignore_patterns):
                            found_imports.append(path)
    
    except (SyntaxError, UnicodeDecodeError):
        pass
    
    return found_imports

def extract_all_import_paths(file_paths, ignore_patterns):
    """Extract all unique local import file paths recursively"""
    all_import_paths = set()
    processed_files = set()
    to_process = []
    
    # Build search paths from all provided directories
    search_paths = []
    for file_path in file_paths:
        if os.path.isdir(file_path):
            search_paths.append(file_path)
            # Add all Python files in directory to process
            for root, dirs, files in os.walk(file_path):
                for file in files:
                    if file.endswith('.py'):
                        to_process.append(os.path.join(root, file))
        else:
            to_process.append(file_path)
            search_paths.append(os.path.dirname(file_path))
    
    # Remove duplicates
    search_paths = list(set(search_paths))
    to_process = list(set(to_process))
    
    # Process files recursively
    queue = to_process[:]
    while queue:
        current_file = queue.pop(0)
        all_import_paths.add(current_file)
        
        imports = extract_imports_from_file(current_file, search_paths, ignore_patterns, processed_files)
        for import_path in imports:
            if import_path not in all_import_paths:
                queue.append(import_path)
    
    return sorted(list(all_import_paths))

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps([]))
        sys.exit(0)
    
    try:
        file_paths = json.loads(sys.argv[1])
        ignore_patterns = json.loads(sys.argv[2])
        import_paths = extract_all_import_paths(file_paths, ignore_patterns)
        print(json.dumps(import_paths))
    except (json.JSONDecodeError, Exception):
        print(json.dumps([]))
`;

export class PythonResolver extends BaseResolver {
  config: ResolverConfig = {
    extensions: [...pythonExtensions],
    configFiles: ["pyproject.toml", "setup.py", "requirements.txt"],
  };

  private helperPath: string | null = null;

  async resolve(
    importPath: string,
    baseDir: string,
    workspaceRoot: string,
  ): Promise<string | null> {
    // Fallback to original logic for single imports
    if (importPath.startsWith(".")) {
      return this.resolveRelativeImport(importPath, baseDir);
    }
    return this.resolveAbsoluteImport(importPath, baseDir, workspaceRoot);
  }

  async resolveAllImports(
    filePaths: string[],
    ignorePatterns: string[] = [],
  ): Promise<string[]> {
    const helperPath = await this.ensureHelperExists();
    if (!helperPath) {
      return filePaths.filter((f) => f.endsWith(".py")); // Return original files as fallback
    }

    try {
      const filesArg = JSON.stringify(filePaths);
      const ignoreArg = JSON.stringify(ignorePatterns);

      const { stdout } = await execFileP("python", [
        helperPath,
        filesArg,
        ignoreArg,
      ]);
      const result = JSON.parse(stdout) || [];
      return result.length > 0
        ? result
        : filePaths.filter((f) => f.endsWith(".py"));
    } catch (error) {
      console.error("Python helper execution failed:", error);
      return filePaths.filter((f) => f.endsWith(".py")); // Return original files as fallback
    }
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
      console.error("Failed to create Python helper:", error);
      return null;
    }
  }

  private resolveRelativeImport(
    importPath: string,
    baseDir: string,
  ): string | null {
    const parts = importPath.split(".");
    let currentDir = baseDir;

    let i = 0;
    while (i < parts.length && parts[i] === "") {
      currentDir = path.dirname(currentDir);
      i++;
    }

    const remainingParts = parts.slice(i).filter((part) => part !== "");
    if (remainingParts.length === 0) {
      return null;
    }

    return this.findModule(currentDir, remainingParts);
  }

  private resolveAbsoluteImport(
    importPath: string,
    baseDir: string,
    workspaceRoot: string,
  ): string | null {
    const parts = importPath.split(".");

    let searchDir = baseDir;
    while (searchDir.startsWith(workspaceRoot)) {
      const result = this.findModule(searchDir, parts);
      if (result) {
        return result;
      }

      const parentDir = path.dirname(searchDir);
      if (parentDir === searchDir) {
        break;
      }
      searchDir = parentDir;
    }

    return null;
  }

  private findModule(baseDir: string, parts: string[]): string | null {
    const modulePath = path.join(baseDir, ...parts);

    const pyFile = modulePath + ".py";
    if (fs.existsSync(pyFile)) {
      return pyFile;
    }

    const initFile = path.join(modulePath, "__init__.py");
    if (fs.existsSync(initFile)) {
      return initFile;
    }

    return null;
  }
}
