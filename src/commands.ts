
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ContextCollector } from "./core";
import { OutputManager } from "./output";
import { parserRegistry } from "./parsers";
import { FileContext } from "./types";
import {
  formatContexts,
  getFilesToProcess,
  getWorkspaceRoot,
  isTextFile,
  shouldIgnoreFile,
} from "./utils";

export class CommandHandler {
  private contextCollector = new ContextCollector();
  private output = OutputManager.getInstance();

  async handleGatherImports(
    uri: vscode.Uri,
    selectedFiles?: vscode.Uri[]
  ): Promise<void> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Code Collector: Processing files...",
        cancellable: true,
      },
      async (progress, token) => {
        try {
          this.output.clear();
          this.output.log("Starting import-based collection...");
          return this.handleImportBasedCollection(uri, selectedFiles, token, false);
        } catch (error) {
          const errorMessage = `Error: ${error}`;
          this.output.error(errorMessage, error);
          vscode.window.showErrorMessage(errorMessage);
          this.output.show();
        }
      }
    );
  }

  async handleGatherDirect(
    uri: vscode.Uri,
    selectedFiles?: vscode.Uri[]
  ): Promise<void> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Code Collector: Direct collection...",
        cancellable: true,
      },
      async (progress, token) => {
        try {
          this.output.clear();
          this.output.log("Starting direct collection...");
          return this.handleDirectCollection(uri, selectedFiles, token);
        } catch (error) {
          const errorMessage = `Error: ${error}`;
          this.output.error(errorMessage, error);
          vscode.window.showErrorMessage(errorMessage);
          this.output.show();
        }
      }
    );
  }

  async handleGatherSmartFilter(
    uri: vscode.Uri,
    selectedFiles?: vscode.Uri[]
  ): Promise<void> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Code Collector: Smart filter collection...",
        cancellable: true,
      },
      async (progress, token) => {
        try {
          this.output.clear();
          this.output.log("Starting smart filter collection...");
          return this.handleImportBasedCollection(uri, selectedFiles, token, true);
        } catch (error) {
          const errorMessage = `Error: ${error}`;
          this.output.error(errorMessage, error);
          vscode.window.showErrorMessage(errorMessage);
          this.output.show();
        }
      }
    );
  }

  private async handleDirectCollection(
    uri: vscode.Uri,
    selectedFiles?: vscode.Uri[],
    token?: vscode.CancellationToken
  ): Promise<void> {
    const allContexts: FileContext[] = [];
    const workspaceRoot = getWorkspaceRoot();

    const urisToProcess = selectedFiles?.length
      ? selectedFiles
      : uri
      ? [uri]
      : [];

    if (urisToProcess.length === 0) {
      const message = "No files or folders selected";
      this.output.error(message);
      vscode.window.showErrorMessage(message);
      return;
    }

    for (const currentUri of urisToProcess) {
      if (token?.isCancellationRequested) {
        return;
      }

      const fsPath = currentUri.fsPath;
      if (!fs.existsSync(fsPath)) {
        continue;
      }

      const stat = fs.statSync(fsPath);

      if (stat.isFile()) {
        if (isTextFile(fsPath)) {
          try {
            const content = fs.readFileSync(fsPath, "utf8");
            const relativePath = path.relative(workspaceRoot, fsPath);
            allContexts.push({ path: fsPath, content, relativePath });
            this.output.log(`Added file: ${relativePath}`);
          } catch (error) {
            this.output.error(`Failed to read: ${fsPath}`, error);
          }
        }
      } else if (stat.isDirectory()) {
        const directoryFiles = await this.collectFilesFromDirectory(
          fsPath,
          workspaceRoot
        );
        for (const filePath of directoryFiles) {
          if (token?.isCancellationRequested) {
            return;
          }

          try {
            const content = fs.readFileSync(filePath, "utf8");
            const relativePath = path.relative(workspaceRoot, filePath);
            allContexts.push({ path: filePath, content, relativePath });
          } catch (error) {
            this.output.error(`Failed to read: ${filePath}`, error);
          }
        }
        this.output.log(
          `Added ${directoryFiles.length} files from: ${path.relative(
            workspaceRoot,
            fsPath
          )}`
        );
      }
    }

    if (token?.isCancellationRequested) {
      return;
    }

    if (allContexts.length === 0) {
      const message = "No text files found in selected items";
      this.output.error(message);
      vscode.window.showErrorMessage(message);
      return;
    }

    const output = formatContexts(allContexts);
    const totalLines = allContexts.reduce(
      (sum, ctx) => sum + ctx.content.split("\n").length,
      0
    );
    await vscode.env.clipboard.writeText(output);

    const successMessage = `Copied ${allContexts.length} files (${totalLines} lines) - direct collection`;
    this.output.log(`✓ ${successMessage}`);
    vscode.window.showInformationMessage(successMessage);
  }

  private async collectFilesFromDirectory(
    dirPath: string,
    workspaceRoot: string
  ): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isFile() && isTextFile(fullPath)) {
          files.push(fullPath);
        } else if (entry.isDirectory()) {
          const subFiles = await this.collectFilesFromDirectory(
            fullPath,
            workspaceRoot
          );
          files.push(...subFiles);
        }
      }
    } catch (error) {
      this.output.error(`Failed to read directory: ${dirPath}`, error);
    }

    return files;
  }

  private async handleImportBasedCollection(
    uri: vscode.Uri,
    selectedFiles?: vscode.Uri[],
    token?: vscode.CancellationToken,
    applyIgnorePatterns: boolean = false
  ): Promise<void> {
    const filesToProcess = await getFilesToProcess(uri, selectedFiles);
    if (filesToProcess.length === 0) {
      const message = "No text files found to process";
      this.output.error(message);
      vscode.window.showErrorMessage(message);
      return;
    }

    if (token?.isCancellationRequested) {
      return;
    }

    const allContexts: FileContext[] = [];
    const processed = new Set<string>();
    const pythonFiles = new Set<string>();
    const workspaceRoot = getWorkspaceRoot();

    this.output.log(
      `Processing ${filesToProcess.length} initial files for imports...`
    );

    for (const filePath of filesToProcess.filter((f) => !f.endsWith(".py"))) {
      if (token?.isCancellationRequested) {
        return;
      }
      await this.contextCollector.processFile(
        filePath,
        allContexts,
        processed,
        workspaceRoot,
        pythonFiles
      );
    }

    filesToProcess
      .filter((f) => f.endsWith(".py"))
      .forEach((f) => pythonFiles.add(f));
    if (token?.isCancellationRequested) {
      return;
    }

    await this.contextCollector.processPythonFiles(
      pythonFiles,
      allContexts,
      processed,
      workspaceRoot
    );
    if (token?.isCancellationRequested) {
      return;
    }

    let finalContexts = allContexts;
    if (applyIgnorePatterns) {
      finalContexts = allContexts.filter(ctx => !shouldIgnoreFile(ctx.relativePath, workspaceRoot));
      const filtered = allContexts.length - finalContexts.length;
      if (filtered > 0) {
        this.output.log(`Filtered out ${filtered} files based on ignore patterns`);
      }
    }

    const output = formatContexts(finalContexts);
    const totalLines = finalContexts.reduce(
      (sum, ctx) => sum + ctx.content.split("\n").length,
      0
    );
    await vscode.env.clipboard.writeText(output);

    const programmingFiles = finalContexts.filter(
      (ctx) => parserRegistry.getParser(ctx.path) !== null
    ).length;
    const modeLabel = applyIgnorePatterns ? "smart filter" : `${programmingFiles} with imports, ${finalContexts.length - programmingFiles} text`;
    const successMessage = `Copied ${finalContexts.length} files (${totalLines} lines) - ${modeLabel}`;

    this.output.log(`✓ ${successMessage}`);
    vscode.window.showInformationMessage(successMessage);
  }

  async handleCollectAll(): Promise<void> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Code Collector: Collecting all files...",
        cancellable: true,
      },
      async (progress, token) => {
        try {
          this.output.clear();
          this.output.log("Starting full workspace collection...");

          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            const message = "No workspace folder open";
            this.output.error(message);
            vscode.window.showErrorMessage(message);
            return;
          }

          if (token.isCancellationRequested) {
            return;
          }

          const contexts = await this.contextCollector.collectAllFiles(
            workspaceFolder.uri.fsPath,
            () => !token.isCancellationRequested
          );

          if (token.isCancellationRequested) {
            return;
          }

          const totalLines = contexts.reduce(
            (sum, ctx) => sum + ctx.content.split("\n").length,
            0
          );
          const output = formatContexts(contexts);
          await vscode.env.clipboard.writeText(output);

          const successMessage = `Copied ${contexts.length} files (${totalLines} lines)`;
          this.output.log(`✓ ${successMessage}`);
          vscode.window.showInformationMessage(successMessage);
        } catch (error) {
          const errorMessage = `Error: ${error}`;
          this.output.error(errorMessage, error);
          vscode.window.showErrorMessage(errorMessage);
          this.output.show();
        }
      }
    );
  }
}