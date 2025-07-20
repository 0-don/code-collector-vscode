import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { parserRegistry } from "./parsers";
import { resolverRegistry } from "./resolvers";
import { FileContext } from "./types";
import { isTextFile } from "./utils";

export class ContextCollector {
  async collectAllFiles(workspaceRoot: string): Promise<FileContext[]> {
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

    for (const file of files) {
      const filePath = file.fsPath;

      // Skip if not a text file
      if (!isTextFile(filePath)) {
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, "utf8");
        const relativePath = path.relative(workspaceRoot, filePath);
        contexts.push({ path: filePath, content, relativePath });
      } catch (error) {
        console.log(`Failed to read file ${filePath}:`, error);
      }
    }

    return contexts;
  }

  async processFile(
    filePath: string,
    contexts: FileContext[],
    processed: Set<string>,
    workspaceRoot: string
  ): Promise<void> {
    const normalizedPath = path.resolve(filePath);

    if (processed.has(normalizedPath) || !fs.existsSync(normalizedPath)) {
      return;
    }

    processed.add(normalizedPath);
    const content = fs.readFileSync(normalizedPath, "utf8");
    const relativePath = path.relative(workspaceRoot, normalizedPath);

    contexts.push({ path: normalizedPath, content, relativePath });

    const parser = parserRegistry.getParser(filePath);
    const resolver = resolverRegistry.getResolver(filePath);

    if (parser && resolver) {
      const imports = await parser.parseImports(content, filePath);

      for (const importInfo of imports) {
        const resolvedPath = resolver.resolve(
          importInfo.module,
          path.dirname(normalizedPath),
          workspaceRoot
        );

        if (resolvedPath) {
          await this.processFile(
            resolvedPath,
            contexts,
            processed,
            workspaceRoot
          );
        }
      }
    }
  }
}
