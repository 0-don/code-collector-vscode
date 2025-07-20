import * as fs from "fs";
import * as vscode from "vscode";
import { parserRegistry } from "../parsers";
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
  const supportedExtensions = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".java",
    ".kt",
  ];
  return supportedExtensions.some((ext) => filePath.endsWith(ext));
}

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
