import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { supportedExtensions } from "../languages";
import { FileContext } from "../types";

export function isTextFile(filePath: string): boolean {
  try {
    const buffer = fs.readFileSync(filePath, { flag: "r" }).slice(0, 1024);

    if (buffer.includes(0)) {
      return false;
    }

    try {
      const text = buffer.toString("utf8");
      if (text.includes("\uFFFD")) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

export function isSupportedFile(filePath: string): boolean {
  return supportedExtensions.some((ext) => filePath.endsWith(ext));
}

export function getFilesToProcess(
  uri: vscode.Uri,
  selectedFiles?: vscode.Uri[]
): string[] {
  if (selectedFiles?.length) {
    return selectedFiles
      .map((f) => f.fsPath)
      .flatMap((path) => expandPathToFiles(path));
  }

  if (uri?.fsPath) {
    return expandPathToFiles(uri.fsPath);
  }

  const activeFile = vscode.window.activeTextEditor?.document.fileName;
  if (activeFile) {
    return [activeFile];
  }

  return [];
}

function expandPathToFiles(fsPath: string): string[] {
  const stat = fs.statSync(fsPath);

  if (stat.isFile()) {
    return isTextFile(fsPath) ? [fsPath] : [];
  }

  if (stat.isDirectory()) {
    const files: string[] = [];
    const entries = fs.readdirSync(fsPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(fsPath, entry.name);
      if (entry.isFile() && isTextFile(fullPath)) {
        files.push(fullPath);
      } else if (entry.isDirectory()) {
        files.push(...expandPathToFiles(fullPath));
      }
    }
    return files;
  }

  return [];
}

export function getWorkspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
}

export function formatContexts(contexts: FileContext[]): string {
  let currentLine = 1;
  let output = "";

  for (const { relativePath, content } of contexts) {
    const lines = content.split("\n");
    const endLine = currentLine + lines.length - 1;
    output += `\n// ${relativePath} (L${currentLine}-L${endLine})\n${content}\n`;
    currentLine = endLine + 1;
  }

  return output;
}
