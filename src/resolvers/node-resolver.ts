import { parse } from "comment-json";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { getIgnorePatternsGlob } from "../config";
import { OutputManager } from "../output";
import { ResolverConfig } from "../types";
import { BaseResolver } from "./base-resolver";

interface TsConfigPaths {
  [pattern: string]: string[];
}

interface TsConfig {
  compilerOptions?: {
    baseUrl?: string;
    paths?: TsConfigPaths;
  };
  extends?: string;
}

type PathMappingCache = {
  baseUrl: string;
  paths: TsConfigPaths;
} | null;

export class NodeResolver extends BaseResolver {
  config: ResolverConfig = {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    configFiles: [], // No longer needed since we find them dynamically
  };

  private pathMappingCache = new Map<string, PathMappingCache>();
  private output = OutputManager.getInstance();

  async resolve(
    importPath: string,
    baseDir: string,
    workspaceRoot: string
  ): Promise<string | null> {
    // Handle relative imports
    if (importPath.startsWith(".")) {
      return this.resolveRelative(importPath, baseDir);
    }

    // Handle absolute/alias imports
    const pathMapping = await this.getPathMapping(workspaceRoot);
    if (pathMapping) {
      return this.resolveWithPathMapping(importPath, pathMapping);
    }

    return null;
  }

  private async findConfigFiles(): Promise<string[]> {
    const ignorePattern = getIgnorePatternsGlob();

    const configs = await vscode.workspace.findFiles(
      "**/tsconfig*.json",
      ignorePattern
    );

    const jsConfigs = await vscode.workspace.findFiles(
      "**/jsconfig*.json",
      ignorePattern
    );

    return [...configs, ...jsConfigs].map((uri) => uri.fsPath);
  }

  private async getPathMapping(
    workspaceRoot: string
  ): Promise<{ baseUrl: string; paths: TsConfigPaths } | null> {
    const cached = this.pathMappingCache.get(workspaceRoot);
    if (cached !== undefined) {
      return cached;
    }

    const configFiles = await this.findConfigFiles();

    for (const configPath of configFiles) {
      if (!fs.existsSync(configPath)) {
        continue;
      }

      try {
        const config = this.loadTsConfig(configPath, workspaceRoot);

        if (config.compilerOptions?.paths) {
          const baseUrl = config.compilerOptions.baseUrl || ".";
          const absoluteBaseUrl = path.resolve(
            path.dirname(configPath),
            baseUrl
          );

          const result = {
            baseUrl: absoluteBaseUrl,
            paths: config.compilerOptions.paths,
          };

          this.output.log(
            `Found path mappings: ${Object.keys(
              config.compilerOptions.paths
            ).join(", ")}`
          );
          this.pathMappingCache.set(workspaceRoot, result);
          return result;
        }
      } catch (error) {
        this.output.error(`Error loading ${path.basename(configPath)}`, error);
        continue;
      }
    }

    this.pathMappingCache.set(workspaceRoot, null);
    return null;
  }

  private loadTsConfig(configPath: string, workspaceRoot: string): TsConfig {
    const configContent = fs.readFileSync(configPath, "utf8");
    const config: TsConfig = parse(configContent) as TsConfig;

    // Handle extends
    if (config.extends) {
      const extendedConfigPath = path.resolve(
        path.dirname(configPath),
        config.extends
      );

      if (fs.existsSync(extendedConfigPath)) {
        const baseConfig = this.loadTsConfig(extendedConfigPath, workspaceRoot);
        // Merge configs (child overrides parent)
        return {
          ...baseConfig,
          compilerOptions: {
            ...baseConfig.compilerOptions,
            ...config.compilerOptions,
            paths: {
              ...baseConfig.compilerOptions?.paths,
              ...config.compilerOptions?.paths,
            },
          },
        };
      }
    }

    return config;
  }

  private resolveWithPathMapping(
    importPath: string,
    pathMapping: { baseUrl: string; paths: TsConfigPaths }
  ): string | null {
    const { baseUrl, paths } = pathMapping;

    // Try each path pattern
    for (const [pattern, mappings] of Object.entries(paths)) {
      if (this.matchesPattern(importPath, pattern)) {
        for (const mapping of mappings) {
          const resolved = this.resolvePattern(
            importPath,
            pattern,
            mapping,
            baseUrl
          );

          if (resolved) {
            const found = this.findFileWithExtension(resolved);

            if (found && !found.includes("node_modules")) {
              return found;
            }
          }
        }
      }
    }

    return null;
  }

  private matchesPattern(importPath: string, pattern: string): boolean {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      return importPath.startsWith(prefix + "/") || importPath === prefix;
    }
    return importPath === pattern;
  }

  private resolvePattern(
    importPath: string,
    pattern: string,
    mapping: string,
    baseUrl: string
  ): string {
    if (pattern.endsWith("/*") && mapping.endsWith("/*")) {
      const patternPrefix = pattern.slice(0, -2);
      const mappingPrefix = mapping.slice(0, -2);
      const suffix = importPath.slice(patternPrefix.length);
      return path.resolve(baseUrl, mappingPrefix + suffix);
    }
    return path.resolve(baseUrl, mapping);
  }

  private resolveRelative(importPath: string, baseDir: string): string | null {
    const resolved = path.resolve(baseDir, importPath);
    return this.findFileWithExtension(resolved);
  }

  private findFileWithExtension(resolved: string): string | null {
    // Check if file exists as-is
    if (fs.existsSync(resolved)) {
      return resolved;
    }

    // Try with extensions
    for (const ext of this.config.extensions) {
      const withExt = resolved + ext;
      if (fs.existsSync(withExt)) {
        return withExt;
      }
    }

    // Try index files
    for (const ext of this.config.extensions) {
      const indexFile = path.join(resolved, `index${ext}`);
      if (fs.existsSync(indexFile)) {
        return indexFile;
      }
    }

    return null;
  }
}
