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
    const progressOptions = {
      location: vscode.ProgressLocation.Notification,
      title: "Code Collector",
      cancellable: true,
    };

    return vscode.window.withProgress(
      progressOptions,
      async (progress, token) => {
        try {
          this.output.clear();
          this.output.log("Starting import-based collection...");

          progress.report({ message: "Finding files..." });

          const filesToProcess = await getFilesToProcess(uri, selectedFiles);
          this.output.log(`Processing ${filesToProcess.length} files`);

          if (filesToProcess.length === 0) {
            const message = "No text files found to process";
            this.output.error(message);
            vscode.window.showErrorMessage(message);
            return;
          }

          if (token.isCancellationRequested) {
            this.output.log("Cancelled");
            return;
          }

          const allContexts: FileContext[] = [];
          const processed = new Set<string>();
          const workspaceRoot = getWorkspaceRoot();

          for (let i = 0; i < filesToProcess.length; i++) {
            if (token.isCancellationRequested) {
              this.output.log("Cancelled");
              return;
            }

            const filePath = filesToProcess[i];
            const fileName = filePath.split("/").pop() || filePath;

            progress.report({
              message: `Processing ${fileName}...`,
              increment: 100 / filesToProcess.length,
            });

            await this.contextCollector.processFile(
              filePath,
              allContexts,
              processed,
              workspaceRoot
            );
          }

          if (token.isCancellationRequested) {
            this.output.log("Cancelled");
            return;
          }

          progress.report({ message: "Formatting output..." });

          const output = formatContexts(allContexts);
          const totalLines = allContexts.reduce(
            (sum, ctx) => sum + ctx.content.split("\n").length,
            0
          );

          await vscode.env.clipboard.writeText(output);

          const programmingFiles = allContexts.filter(
            (ctx) => parserRegistry.getParser(ctx.path) !== null
          ).length;

          const textFiles = allContexts.length - programmingFiles;

          const successMessage = `Copied ${allContexts.length} files (${totalLines} lines) - ${programmingFiles} with imports, ${textFiles} text`;

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
    const progressOptions = {
      location: vscode.ProgressLocation.Notification,
      title: "Code Collector",
      cancellable: true,
    };

    return vscode.window.withProgress(
      progressOptions,
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

          progress.report({ message: "Scanning files..." });

          if (token.isCancellationRequested) {
            this.output.log("Cancelled");
            return;
          }

          const contexts = await this.contextCollector.collectAllFiles(
            workspaceFolder.uri.fsPath,
            (current, total) => {
              if (token.isCancellationRequested) {
                return false;
              }

              progress.report({
                message: `Processing files... (${current}/${total})`,
                increment: 100 / total,
              });
              return true;
            }
          );

          if (token.isCancellationRequested) {
            this.output.log("Cancelled");
            return;
          }

          progress.report({ message: "Formatting..." });

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
