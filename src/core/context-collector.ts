import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { FileContext } from "../types";
import { isTextFile } from "../utils/file-utils";

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
}
