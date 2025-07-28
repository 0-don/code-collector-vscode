import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { OutputManager } from "./output";
import { parserRegistry } from "./parsers";
import { resolverRegistry } from "./resolvers";
import { FileContext } from "./types";
import { isTextFile } from "./utils";

export class ContextCollector {
  private output = OutputManager.getInstance();

  async collectAllFiles(
    workspaceRoot: string,
    progressCallback?: (current: number, total: number) => boolean
  ): Promise<FileContext[]> {
    const config = vscode.workspace.getConfiguration("codeCollector");
    const defaultIgnorePatterns =
      config.inspect<string[]>("ignorePatterns")?.defaultValue || [];
    const userIgnorePatterns = config.get<string[]>("ignorePatterns", []);
    const ignorePatterns = [...defaultIgnorePatterns, ...userIgnorePatterns];

    const contexts: FileContext[] = [];
    const files = await vscode.workspace.findFiles(
      "**/*",
      `{${ignorePatterns.join(",")}}`
    );

    this.output.log(`Found ${files.length} files to scan`);

    for (let i = 0; i < files.length; i++) {
      if (progressCallback && !progressCallback(i + 1, files.length)) {
        this.output.log("Collection cancelled");
        break;
      }

      const file = files[i];
      const filePath = file.fsPath;

      if (!isTextFile(filePath)) {
        continue;
      }

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

  async processFile(
    filePath: string,
    contexts: FileContext[],
    processed: Set<string>,
    workspaceRoot: string
  ): Promise<void> {
    const normalizedPath = path.resolve(filePath);

    if (processed.has(normalizedPath)) {
      return;
    }
    if (!fs.existsSync(normalizedPath)) {
      this.output.warn(`File not found: ${normalizedPath}`);
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
              workspaceRoot
            );
          }
        }
      }
    } catch (error) {
      this.output.error(`Failed to process: ${normalizedPath}`, error);
    }
  }
}
