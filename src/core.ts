import * as fs from "fs";
import * as micromatch from "micromatch";
import * as path from "path";
import { getIgnorePatterns } from "./config";
import { OutputManager } from "./output";
import { parserRegistry } from "./parsers";
import { resolverRegistry } from "./resolvers";
import { PythonResolver } from "./resolvers/python-resolver";
import { FileContext } from "./types";
import { isTextFile } from "./utils";

export class ContextCollector {
  private output = OutputManager.getInstance();

  async collectAllFiles(
    workspaceRoot: string,
    progressCallback?: (current: number, total: number) => boolean
  ): Promise<FileContext[]> {
    const ignorePatterns = getIgnorePatterns();

    this.output.log("Starting file discovery with micromatch...");
    this.output.log(`Using ${ignorePatterns.length} ignore patterns`);

    // Recursively discover files while respecting ignore patterns
    const filteredFiles = await this.discoverFiles(
      workspaceRoot,
      workspaceRoot,
      ignorePatterns
    );
    this.output.log(`Discovered ${filteredFiles.length} files after filtering`);

    // Process files and create contexts
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
    ignorePatterns: string[]
  ): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(workspaceRoot, fullPath);

        if (entry.isDirectory()) {
          // Check if this directory should be ignored
          const isIgnored =
            micromatch.isMatch(relativePath, ignorePatterns, {
              dot: true,
              matchBase: true,
            }) ||
            micromatch.isMatch(entry.name, ignorePatterns, {
              dot: true,
              matchBase: true,
            });

          if (!isIgnored) {
            // Only recurse into directories that aren't ignored
            const subFiles = await this.discoverFiles(
              fullPath,
              workspaceRoot,
              ignorePatterns
            );
            files.push(...subFiles);
          }
        } else if (entry.isFile()) {
          // Check if this file should be ignored
          const isIgnored =
            micromatch.isMatch(relativePath, ignorePatterns, {
              dot: true,
              matchBase: true,
            }) ||
            micromatch.isMatch(entry.name, ignorePatterns, {
              dot: true,
              matchBase: true,
            });

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

  async processFile(
    filePath: string,
    contexts: FileContext[],
    processed: Set<string>,
    workspaceRoot: string,
    pythonFiles: Set<string>
  ): Promise<void> {
    const normalizedPath = path.resolve(filePath);

    if (processed.has(normalizedPath) || !fs.existsSync(normalizedPath)) {
      return;
    }

    // Collect Python files for batch processing
    if (filePath.endsWith(".py")) {
      pythonFiles.add(normalizedPath);
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

        for (const importInfo of imports) {
          const resolvedPath = await resolver.resolve(
            importInfo.module,
            path.dirname(normalizedPath),
            workspaceRoot
          );

          if (resolvedPath && parserRegistry.getParser(resolvedPath)) {
            await this.processFile(
              resolvedPath,
              contexts,
              processed,
              workspaceRoot,
              pythonFiles
            );
          }
        }
      }
    } catch (error) {
      this.output.error(`Failed to process: ${normalizedPath}`, error);
    }
  }

  async processPythonFiles(
    pythonFiles: Set<string>,
    contexts: FileContext[],
    processed: Set<string>,
    workspaceRoot: string
  ): Promise<void> {
    if (pythonFiles.size === 0) {
      return;
    }

    this.output.log(
      `Processing ${pythonFiles.size} Python files with helper...`
    );

    const resolver = resolverRegistry.getResolver("dummy.py") as PythonResolver;
    const ignorePatterns = getIgnorePatterns();

    try {
      const allPythonFiles = await resolver.resolveAllImports(
        Array.from(pythonFiles),
        ignorePatterns
      );
      this.output.log(
        `Python helper found ${allPythonFiles.length} total Python files`
      );

      for (const pythonFile of allPythonFiles) {
        const normalizedPath = path.resolve(pythonFile);

        if (!processed.has(normalizedPath) && fs.existsSync(normalizedPath)) {
          processed.add(normalizedPath);

          try {
            const content = fs.readFileSync(normalizedPath, "utf8");
            const relativePath = path.relative(workspaceRoot, normalizedPath);
            contexts.push({ path: normalizedPath, content, relativePath });
          } catch (error) {
            this.output.error(
              `Failed to read Python file: ${normalizedPath}`,
              error
            );
          }
        }
      }
    } catch (error) {
      this.output.error(
        `Python helper failed, processing files individually`,
        error
      );

      // Fallback: add Python files without import resolution
      for (const pythonFile of pythonFiles) {
        if (!processed.has(pythonFile)) {
          processed.add(pythonFile);

          try {
            const content = fs.readFileSync(pythonFile, "utf8");
            const relativePath = path.relative(workspaceRoot, pythonFile);
            contexts.push({ path: pythonFile, content, relativePath });
          } catch (error) {
            this.output.error(
              `Failed to read Python file: ${pythonFile}`,
              error
            );
          }
        }
      }
    }
  }
}
