import * as fs from "fs";
import * as vscode from "vscode";
import { getIgnorePatternsGlob } from "../config";
import { supportedExtensions } from "../languages";
import { FileContext } from "../types";

export function isTextFile(filePath: string): boolean {
  try {
    const buffer = fs.readFileSync(filePath, { flag: "r" }).slice(0, 1024);
    if (buffer.includes(0)) {
      return false;
    }

    const text = buffer.toString("utf8");
    return !text.includes("\uFFFD");
  } catch {
    return false;
  }
}

export function isSupportedFile(filePath: string): boolean {
  return supportedExtensions.some((ext) => filePath.endsWith(ext));
}

export async function getFilesToProcess(
  uri: vscode.Uri,
  selectedFiles?: vscode.Uri[]
): Promise<string[]> {
  const excludePattern = getIgnorePatternsGlob();

  const filesToProcess = new Set<string>();
  const urisToProcess = selectedFiles?.length
    ? selectedFiles
    : uri
    ? [uri]
    : [];
  for (const u of urisToProcess) {
    const fsPath = u.fsPath;
    if (!fs.existsSync(fsPath)) {
      continue;
    }

    const stat = fs.statSync(fsPath);
    if (stat.isFile()) {
      // Direct file check - bypass glob patterns for individual files
      if (isTextFile(fsPath)) {
        filesToProcess.add(fsPath);
      }
    } else if (stat.isDirectory()) {
      const pattern = new vscode.RelativePattern(u, "**/*");
      const foundFiles = await vscode.workspace.findFiles(
        pattern,
        excludePattern
      );
      for (const file of foundFiles) {
        if (isTextFile(file.fsPath)) {
          filesToProcess.add(file.fsPath);
        }
      }
    }
  }

  // Fallback to active editor if no files found
  if (filesToProcess.size === 0) {
    const activeEditorFile = vscode.window.activeTextEditor?.document.uri;
    if (activeEditorFile && isTextFile(activeEditorFile.fsPath)) {
      filesToProcess.add(activeEditorFile.fsPath);
    }
  }

  return Array.from(filesToProcess);
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
