import * as vscode from "vscode";
import { ContextCollector } from "./core";
import { FileContext } from "./types";
import { formatContexts, getFilesToProcess, getWorkspaceRoot } from "./utils";

export class CommandHandler {
  private contextCollector = new ContextCollector();

  async handleGatherImports(
    uri: vscode.Uri,
    selectedFiles?: vscode.Uri[]
  ): Promise<void> {
    try {
      const filesToProcess = getFilesToProcess(uri, selectedFiles);

      if (filesToProcess.length === 0) {
        vscode.window.showErrorMessage("Please select supported files");
        return;
      }

      const allContexts: FileContext[] = [];
      const processed = new Set<string>();
      const workspaceRoot = getWorkspaceRoot();

      for (const filePath of filesToProcess) {
        await this.contextCollector.processFile(
          filePath,
          allContexts,
          processed,
          workspaceRoot
        );
      }

      const output = formatContexts(allContexts);
      const totalLines = allContexts.reduce(
        (sum, ctx) => sum + ctx.content.split("\n").length,
        0
      );

      await vscode.env.clipboard.writeText(output);

      vscode.window.showInformationMessage(
        `Copied context for ${allContexts.length} files (${totalLines} lines) from ${filesToProcess.length} selected`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error: ${error}`);
    }
  }

  async handleCollectAll(): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      const contexts = await this.contextCollector.collectAllFiles(
        workspaceFolder.uri.fsPath
      );
      const totalLines = contexts.reduce(
        (sum, ctx) => sum + ctx.content.split("\n").length,
        0
      );

      const output = formatContexts(contexts);

      await vscode.env.clipboard.writeText(output);
      vscode.window.showInformationMessage(
        `Copied all code context for ${contexts.length} files (${totalLines} lines)`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error: ${error}`);
    }
  }
}
