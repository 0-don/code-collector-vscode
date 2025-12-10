import * as fs from "fs";
import * as micromatch from "micromatch";
import * as path from "path";
import * as vscode from "vscode";
import { getIgnorePatterns, getIgnorePatternsGlob } from "../lib/config";
import { supportedExtensions } from "../lib/languages";
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

export function shouldIgnoreFile(
  relativePath: string,
  workspaceRoot: string,
): boolean {
  const ignorePatterns = getIgnorePatterns();
  const filename = path.basename(relativePath);

  return (
    micromatch.isMatch(relativePath, ignorePatterns, { dot: true }) ||
    micromatch.isMatch(filename, ignorePatterns, { dot: true })
  );
}

export async function getFilesToProcess(
  uri: vscode.Uri,
  selectedFiles?: vscode.Uri[],
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
      if (isTextFile(fsPath)) {
        filesToProcess.add(fsPath);
      }
    } else if (stat.isDirectory()) {
      const pattern = new vscode.RelativePattern(u, "**/*");
      const foundFiles = await vscode.workspace.findFiles(
        pattern,
        excludePattern,
      );
      for (const file of foundFiles) {
        if (isTextFile(file.fsPath)) {
          filesToProcess.add(file.fsPath);
        }
      }
    }
  }

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
