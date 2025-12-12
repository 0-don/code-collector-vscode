import * as fs from "fs";
import * as micromatch from "micromatch";
import * as path from "path";
import { parserRegistry } from "../parsers";
import { resolverRegistry } from "../resolvers";
import { FileContext } from "../types";
import { findProjectRoot, isTextFile } from "../utils";
import { getIgnorePatterns } from "./config";
import { OutputManager } from "./output";

export class ContextCollector {
  private output = OutputManager.getInstance();
  private projectRootCache = new Map<string, string>();

  async collectAllFiles(
    workspaceRoot: string,
    progressCallback?: (current: number, total: number) => boolean,
  ): Promise<FileContext[]> {
    const ignorePatterns = getIgnorePatterns();

    this.output.log(`Using ${ignorePatterns.length} ignore patterns`);

    const filteredFiles = await this.discoverFiles(
      workspaceRoot,
      workspaceRoot,
      ignorePatterns,
    );
    this.output.log(`Discovered ${filteredFiles.length} files after filtering`);

    const contexts: FileContext[] = [];
    for (let i = 0; i < filteredFiles.length; i++) {
      if (progressCallback && !progressCallback(i + 1, filteredFiles.length)) {
        this.output.log("Collection cancelled");
        break;
      }

      const filePath = filteredFiles[i];

      try {
        const content = fs.readFileSync(filePath, "utf8");
        const relativePath = path.relative(workspaceRoot, filePath);
        contexts.push({ path: filePath, content, relativePath });
      } catch (error) {
        this.output.error(`Failed to read: ${filePath}`, error);
      }
    }

    this.output.log(`Collected ${contexts.length} files`);
    return contexts;
  }

  private async discoverFiles(
    dir: string,
    workspaceRoot: string,
    ignorePatterns: string[],
  ): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(workspaceRoot, fullPath);

        if (entry.isDirectory()) {
          const directoryName = entry.name;
          const isIgnored =
            micromatch.isMatch(relativePath, ignorePatterns, { dot: true }) ||
            micromatch.isMatch(relativePath + "/", ignorePatterns, {
              dot: true,
            }) ||
            micromatch.isMatch(directoryName, ignorePatterns, { dot: true });

          if (!isIgnored) {
            const subFiles = await this.discoverFiles(
              fullPath,
              workspaceRoot,
              ignorePatterns,
            );
            files.push(...subFiles);
          }
        } else if (entry.isFile()) {
          const filename = path.basename(fullPath);
          const isIgnored =
            micromatch.isMatch(relativePath, ignorePatterns, { dot: true }) ||
            micromatch.isMatch(filename, ignorePatterns, { dot: true });

          if (!isIgnored && isTextFile(fullPath)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      this.output.error(`Failed to read directory: ${dir}`, error);
    }

    return files;
  }

  private getProjectRootForFile(filePath: string): string {
    if (this.projectRootCache.has(filePath)) {
      return this.projectRootCache.get(filePath)!;
    }

    const projectRoot = findProjectRoot(filePath);
    this.projectRootCache.set(filePath, projectRoot);
    return projectRoot;
  }

  async processFile(
    filePath: string,
    contexts: FileContext[],
    processed: Set<string>,
    workspaceRoot: string,
  ): Promise<void> {
    const normalizedPath = path.resolve(filePath);

    if (processed.has(normalizedPath) || !fs.existsSync(normalizedPath)) {
      return;
    }

    processed.add(normalizedPath);

    try {
      const content = fs.readFileSync(normalizedPath, "utf8");
      const relativePath = path.relative(workspaceRoot, normalizedPath);
      contexts.push({ path: normalizedPath, content, relativePath });

      const parser = parserRegistry.getParser(filePath);
      const resolver = resolverRegistry.getResolver(filePath);

      if (parser && resolver) {
        const imports = await parser.parseImports(content, filePath);
        if (imports.length > 0) {
          this.output.log(`${relativePath}: ${imports.length} imports`);
        }

        const projectRoot = this.getProjectRootForFile(normalizedPath);

        for (const importInfo of imports) {
          const resolvedPath = await resolver.resolve(
            importInfo.module,
            path.dirname(normalizedPath),
            projectRoot,
          );

          if (resolvedPath && parserRegistry.getParser(resolvedPath)) {
            await this.processFile(
              resolvedPath,
              contexts,
              processed,
              workspaceRoot,
            );
          }
        }
      }
    } catch (error) {
      this.output.error(`Failed to process: ${normalizedPath}`, error);
    }
  }
}
