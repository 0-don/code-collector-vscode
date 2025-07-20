import * as fs from "fs";
import * as path from "path";
import { ResolverConfig } from "../types";
import { BaseResolver } from "./base-resolver";

export class PythonResolver extends BaseResolver {
  config: ResolverConfig = {
    extensions: [".py"],
    configFiles: ["pyproject.toml", "setup.py", "requirements.txt"],
  };

  async resolve(
    importPath: string,
    baseDir: string,
    workspaceRoot: string
  ): Promise<string | null> {
    // Handle relative imports
    if (importPath.startsWith(".")) {
      return this.resolveRelativeImport(importPath, baseDir);
    }

    // Handle absolute imports
    return this.resolveAbsoluteImport(importPath, baseDir, workspaceRoot);
  }

  private resolveRelativeImport(
    importPath: string,
    baseDir: string
  ): string | null {
    const parts = importPath.split(".");
    let currentDir = baseDir;

    // Handle leading dots (go up directories)
    let i = 0;
    while (i < parts.length && parts[i] === "") {
      currentDir = path.dirname(currentDir);
      i++;
    }

    // Build path from remaining parts
    const remainingParts = parts.slice(i).filter((part) => part !== "");
    if (remainingParts.length === 0) {
      return null;
    }

    return this.findModule(currentDir, remainingParts);
  }

  private resolveAbsoluteImport(
    importPath: string,
    baseDir: string,
    workspaceRoot: string
  ): string | null {
    const parts = importPath.split(".");

    // Search from current directory up to workspace root
    let searchDir = baseDir;
    while (searchDir.startsWith(workspaceRoot)) {
      const result = this.findModule(searchDir, parts);
      if (result) {
        return result;
      }

      // Move up one directory
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

    // Try as .py file
    const pyFile = modulePath + ".py";
    if (fs.existsSync(pyFile)) {
      return pyFile;
    }

    // Try as package (__init__.py)
    const initFile = path.join(modulePath, "__init__.py");
    if (fs.existsSync(initFile)) {
      return initFile;
    }

    return null;
  }
}
