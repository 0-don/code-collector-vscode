import * as vscode from "vscode";
import { parserRegistry } from "../parsers";
import { isSupportedFile } from "./file-utils";

export function getFilesToProcess(
  uri: vscode.Uri,
  selectedFiles?: vscode.Uri[]
): string[] {
  const supportedExtensions = parserRegistry.getSupportedExtensions();

  if (selectedFiles?.length) {
    return selectedFiles
      .map((f) => f.fsPath)
      .filter((path) => supportedExtensions.some((ext) => path.endsWith(ext)));
  }

  if (uri?.fsPath && isSupportedFile(uri.fsPath)) {
    return [uri.fsPath];
  }

  const activeFile = vscode.window.activeTextEditor?.document.fileName;
  if (activeFile && isSupportedFile(activeFile)) {
    return [activeFile];
  }

  return [];
}

export function getWorkspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
}
