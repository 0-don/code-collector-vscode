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
    configFiles: [],
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

    // Sort patterns by specificity (more specific patterns first)
    const sortedPatterns = Object.keys(paths).sort((a, b) => {
      const aSpecificity = this.getPatternSpecificity(a);
      const bSpecificity = this.getPatternSpecificity(b);
      return bSpecificity - aSpecificity;
    });

    // Try each path pattern
    for (const pattern of sortedPatterns) {
      if (this.matchesPattern(importPath, pattern)) {
        const mappings = paths[pattern];

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

  private getPatternSpecificity(pattern: string): number {
    // More specific patterns get higher scores
    let score = 0;

    // Exact matches are most specific
    if (!pattern.includes("*")) {
      score += 1000;
    }

    // Patterns with more path segments are more specific
    score += pattern.split("/").length * 10;

    // Patterns with wildcards at the end are more specific than in the middle
    if (pattern.endsWith("*") || pattern.endsWith("/*")) {
      score += 5;
    }

    // Longer patterns are generally more specific
    score += pattern.length;

    return score;
  }

  private matchesPattern(importPath: string, pattern: string): boolean {
    // Handle exact matches
    if (pattern === importPath) {
      return true;
    }

    // Handle patterns without wildcards (prefix matching)
    if (!pattern.includes("*")) {
      return importPath.startsWith(pattern);
    }

    // Handle wildcard patterns
    if (pattern.includes("*")) {
      const regex = this.patternToRegex(pattern);
      return regex.test(importPath);
    }

    return false;
  }

  private patternToRegex(pattern: string): RegExp {
    // Escape special regex characters except *
    let escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

    // Handle different wildcard scenarios
    if (pattern.endsWith("/*")) {
      // Common case: "@/*" should match "@/anything" and "@/path/to/file"
      const prefix = pattern.slice(0, -2);
      escaped = escaped.slice(0, -3); // Remove the escaped /*
      return new RegExp(`^${escaped}\/.*$`);
    } else if (pattern.includes("*")) {
      // General wildcard handling
      // * matches any sequence of characters except /
      escaped = escaped.replace(/\\\*/g, "([^/]*)");
      return new RegExp(`^${escaped}$`);
    }

    return new RegExp(`^${escaped}$`);
  }

  private resolvePattern(
    importPath: string,
    pattern: string,
    mapping: string,
    baseUrl: string
  ): string {
    // Handle exact matches or patterns without wildcards
    if (!pattern.includes("*")) {
      if (!mapping.includes("*")) {
        // Direct substitution
        const suffix = importPath.slice(pattern.length);
        return path.resolve(baseUrl, mapping + suffix);
      } else {
        // Pattern has no wildcard but mapping does - replace first *
        return path.resolve(
          baseUrl,
          mapping.replace("*", importPath.slice(pattern.length))
        );
      }
    }

    // Handle wildcard patterns
    if (pattern.includes("*") && mapping.includes("*")) {
      return this.resolveWildcardPattern(importPath, pattern, mapping, baseUrl);
    }

    // Fallback: simple substitution
    return path.resolve(baseUrl, mapping);
  }

  private resolveWildcardPattern(
    importPath: string,
    pattern: string,
    mapping: string,
    baseUrl: string
  ): string {
    // Handle the most common case: "prefix/*" -> "mappingPrefix/*"
    if (pattern.endsWith("/*") && mapping.endsWith("/*")) {
      const patternPrefix = pattern.slice(0, -2);
      const mappingPrefix = mapping.slice(0, -2);

      if (
        importPath.startsWith(patternPrefix + "/") ||
        importPath === patternPrefix
      ) {
        const suffix = importPath.slice(patternPrefix.length);
        return path.resolve(baseUrl, mappingPrefix + suffix);
      }
    }

    // Handle multiple wildcards (more complex case)
    const patternParts = pattern.split("*");
    const mappingParts = mapping.split("*");

    if (patternParts.length !== mappingParts.length) {
      // Fallback for mismatched wildcards - use simple replacement
      return path.resolve(baseUrl, mapping.replace(/\*/g, ""));
    }

    let result = mappingParts[0];
    let remaining = importPath;

    // Process each wildcard segment
    for (let i = 0; i < patternParts.length - 1; i++) {
      const prefix = patternParts[i];
      const suffix = patternParts[i + 1];

      // Skip the prefix part
      if (remaining.startsWith(prefix)) {
        remaining = remaining.slice(prefix.length);
      }

      // Find where the next pattern part starts
      let captured: string;
      if (suffix === "") {
        // Last wildcard - capture everything remaining
        captured = remaining;
        remaining = "";
      } else {
        const nextIndex = remaining.indexOf(suffix);
        if (nextIndex === -1) {
          // Pattern doesn't match - capture everything
          captured = remaining;
          remaining = "";
        } else {
          captured = remaining.slice(0, nextIndex);
          remaining = remaining.slice(nextIndex);
        }
      }

      result += captured + mappingParts[i + 1];
    }

    return path.resolve(baseUrl, result);
  }

  private resolveRelative(importPath: string, baseDir: string): string | null {
    const resolved = path.resolve(baseDir, importPath);
    return this.findFileWithExtension(resolved);
  }

  private findFileWithExtension(resolved: string): string | null {
    // Check if file exists as-is
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }

    // Try with extensions
    for (const ext of this.config.extensions) {
      const withExt = resolved + ext;
      if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
        return withExt;
      }
    }

    // Try index files in directory
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      for (const ext of this.config.extensions) {
        const indexFile = path.join(resolved, `index${ext}`);
        if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
          return indexFile;
        }
      }
    }

    return null;
  }
}
