import * as vscode from "vscode";
import { ContextCollector } from "./core";
import { OutputManager } from "./output";
import { parserRegistry } from "./parsers";
import { FileContext } from "./types";
import { formatContexts, getFilesToProcess, getWorkspaceRoot } from "./utils";

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

          const filesToProcess = await getFilesToProcess(uri, selectedFiles);
          if (filesToProcess.length === 0) {
            const message = "No text files found to process";
            this.output.error(message);
            vscode.window.showErrorMessage(message);
            return;
          }

          if (token.isCancellationRequested) {
            return;
          }

          const allContexts: FileContext[] = [];
          const processed = new Set<string>();
          const pythonFiles = new Set<string>();
          const workspaceRoot = getWorkspaceRoot();

          // Process non-Python files
          for (const filePath of filesToProcess.filter(
            (f) => !f.endsWith(".py")
          )) {
            if (token.isCancellationRequested) {
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

          // Add initial Python files and process them all at once
          filesToProcess
            .filter((f) => f.endsWith(".py"))
            .forEach((f) => pythonFiles.add(f));
          if (token.isCancellationRequested) {
            return;
          }

          await this.contextCollector.processPythonFiles(
            pythonFiles,
            allContexts,
            processed,
            workspaceRoot
          );
          if (token.isCancellationRequested) {
            return;
          }

          const output = formatContexts(allContexts);
          const totalLines = allContexts.reduce(
            (sum, ctx) => sum + ctx.content.split("\n").length,
            0
          );
          await vscode.env.clipboard.writeText(output);

          const programmingFiles = allContexts.filter(
            (ctx) => parserRegistry.getParser(ctx.path) !== null
          ).length;
          const successMessage = `Copied ${
            allContexts.length
          } files (${totalLines} lines) - ${programmingFiles} with imports, ${
            allContexts.length - programmingFiles
          } text`;

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
