import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { javascriptExtensions } from "../lib/languages";
import { ResolverConfig } from "../types";
import { BaseResolver } from "./base-resolver";

export class NodeResolver extends BaseResolver {
  config: ResolverConfig = {
    extensions: [...javascriptExtensions],
    configFiles: [],
  };

  private compilerOptionsCache = new Map<string, ts.CompilerOptions>();

  async resolve(
    importPath: string,
    baseDir: string,
    workspaceRoot: string,
  ): Promise<string | null> {
    // Handle relative imports
    if (importPath.startsWith(".")) {
      return this.resolveRelative(importPath, baseDir);
    }

    // Use TypeScript's module resolution
    const compilerOptions = await this.getCompilerOptions(workspaceRoot);
    const result = ts.resolveModuleName(
      importPath,
      path.join(baseDir, "dummy.ts"), // TypeScript needs a file context
      compilerOptions,
      ts.sys,
    );

    if (result.resolvedModule?.resolvedFileName) {
      const resolved = result.resolvedModule.resolvedFileName;
      // Only return if it's not in node_modules
      if (!resolved.includes("node_modules")) {
        return resolved;
      }
    }

    return null;
  }

  private async getCompilerOptions(
    workspaceRoot: string,
  ): Promise<ts.CompilerOptions> {
    if (this.compilerOptionsCache.has(workspaceRoot)) {
      return this.compilerOptionsCache.get(workspaceRoot)!;
    }

    // Find tsconfig.json
    const configPath =
      ts.findConfigFile(workspaceRoot, ts.sys.fileExists, "tsconfig.json") ||
      ts.findConfigFile(workspaceRoot, ts.sys.fileExists, "jsconfig.json");

    let compilerOptions: ts.CompilerOptions = {
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      allowJs: true,
    };

    if (configPath) {
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      if (!configFile.error) {
        const parsedConfig = ts.parseJsonConfigFileContent(
          configFile.config,
          ts.sys,
          path.dirname(configPath),
        );
        compilerOptions = parsedConfig.options;
      }
    }

    this.compilerOptionsCache.set(workspaceRoot, compilerOptions);
    return compilerOptions;
  }

  private resolveRelative(importPath: string, baseDir: string): string | null {
    const resolved = path.resolve(baseDir, importPath);
    return this.findFileWithExtension(resolved);
  }

  private findFileWithExtension(resolved: string): string | null {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }

    for (const ext of this.config.extensions) {
      const withExt = resolved + ext;
      if (fs.existsSync(withExt)) {
        return withExt;
      }
    }

    for (const ext of this.config.extensions) {
      const indexFile = path.join(resolved, `index${ext}`);
      if (fs.existsSync(indexFile)) {
        return indexFile;
      }
    }

    return null;
  }
}
