import * as fs from "fs";
import * as path from "path";
import { pythonExtensions } from "../lib/languages";
import { ResolverConfig } from "../types";
import { BaseResolver } from "./base-resolver";

export class PythonResolver extends BaseResolver {
  config: ResolverConfig = {
    extensions: [...pythonExtensions],
    configFiles: ["pyproject.toml", "setup.py", "requirements.txt"],
  };

  async resolve(
    importPath: string,
    baseDir: string,
    workspaceRoot: string,
  ): Promise<string | null> {
    if (importPath.startsWith(".")) {
      return this.resolveRelativeImport(importPath, baseDir);
    }
    return this.resolveAbsoluteImport(importPath, baseDir, workspaceRoot);
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
