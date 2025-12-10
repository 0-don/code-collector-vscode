import * as path from "path";
import * as vscode from "vscode";
import { FileContext } from "../types";

interface FileTypeStats {
  [ext: string]: { count: number; lines: number };
}

export function getFileTypeStats(contexts: FileContext[]): FileTypeStats {
  const stats: FileTypeStats = {};

  for (const ctx of contexts) {
    const ext = path.extname(ctx.path) || "no extension";
    const lines = ctx.content.split("\n").length;

    if (!stats[ext]) {
      stats[ext] = { count: 0, lines: 0 };
    }

    stats[ext].count++;
    stats[ext].lines += lines;
  }

  return stats;
}

function showStatsQuickPick(
  fileCount: number,
  totalLines: number,
  stats: FileTypeStats,
  modeLabel?: string,
): void {
  const entries = Object.entries(stats).sort((a, b) => b[1].lines - a[1].lines);

  const items = entries.map(([ext, { count, lines }]) => ({
    label: ext,
    description: `${count} files`,
    detail: `${lines} lines`,
  }));

  const quickPick = vscode.window.createQuickPick();
  quickPick.title = `✓ Copied ${fileCount} files (${totalLines} lines)${modeLabel ? ` - ${modeLabel}` : ""}`;
  quickPick.items = items;
  quickPick.canSelectMany = false;

  quickPick.onDidHide(() => quickPick.dispose());
  quickPick.show();
}

export function showStatsNotification(
  fileCount: number,
  totalLines: number,
  stats: FileTypeStats,
  modeLabel?: string,
): void {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.text = `$(list-unordered) File Stats (${fileCount} files, ${totalLines} lines)`;
  statusBarItem.tooltip = "Click to view file type breakdown";
  statusBarItem.command = "code-collector.showTempStats";

  const disposable = vscode.commands.registerCommand(
    "code-collector.showTempStats",
    () => {
      showStatsQuickPick(fileCount, totalLines, stats, modeLabel);
    },
  );

  statusBarItem.show();

  setTimeout(() => {
    statusBarItem.dispose();
    disposable.dispose();
  }, 10000);

  vscode.window.showInformationMessage(
    `Copied ${fileCount} files (${totalLines} lines)${modeLabel ? ` - ${modeLabel}` : ""}`,
  );
}
