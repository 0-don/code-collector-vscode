import * as vscode from "vscode";
import { ContextCollector } from "../core/context-collector";
import { FileProcessor } from "../core/file-processor";
import { FileContext } from "../types";
import { getFilesToProcess, getWorkspaceRoot } from "../utils/file-selection";
import { formatContexts } from "../utils/format-utils";

export class CommandHandler {
  private fileProcessor = new FileProcessor();
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
        await this.fileProcessor.processFile(
          filePath,
          allContexts,
          processed,
          workspaceRoot
        );
      }

      const output = formatContexts(allContexts);
      await vscode.env.clipboard.writeText(output);

      vscode.window.showInformationMessage(
        `Copied context for ${allContexts.length} files (from ${filesToProcess.length} selected)`
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
      const output = formatContexts(contexts);

      await vscode.env.clipboard.writeText(output);
      vscode.window.showInformationMessage(
        `Copied all code context for ${contexts.length} files`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error: ${error}`);
    }
  }
}
