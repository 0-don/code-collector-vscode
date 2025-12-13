import * as path from "path";
import * as vscode from "vscode";
import { FileContext } from "../types";

interface FileTypeStats {
  [ext: string]: { count: number; lines: number };
}

let activeStatsDisposable: vscode.Disposable | null = null;
let activeStatusBarItem: vscode.StatusBarItem | null = null;

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

async function getLanguageName(ext: string): Promise<string> {
  if (ext === "no extension") {
    return "no extension";
  }

  try {
    const languages = await import("linguist-languages");
    const extNormalized = ext.toLowerCase();

    for (const [langName, langData] of Object.entries(languages)) {
      const extensions = (langData as any).extensions;
      if (
        Array.isArray(extensions) &&
        extensions.some((e: string) => e.toLowerCase() === extNormalized)
      ) {
        return langName;
      }
    }
  } catch (error) {
    // Silently fallback to extension if linguist-languages fails
  }

  return ext;
}

async function showStatsQuickPick(
  fileCount: number,
  totalLines: number,
  stats: FileTypeStats,
  modeLabel?: string,
): Promise<void> {
  const entries = Object.entries(stats).sort((a, b) => b[1].lines - a[1].lines);

  const items = await Promise.all(
    entries.map(async ([ext, { count, lines }]) => {
      const langName = await getLanguageName(ext);
      const displayLabel =
        ext === "no extension" ? "no extension" : `${langName} (${ext})`;

      return {
        label: displayLabel,
        description: `${count} files`,
        detail: `${lines} lines`,
      };
    }),
  );

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
  if (activeStatsDisposable) {
    activeStatsDisposable.dispose();
    activeStatsDisposable = null;
  }

  if (activeStatusBarItem) {
    activeStatusBarItem.dispose();
    activeStatusBarItem = null;
  }

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

  activeStatsDisposable = disposable;
  activeStatusBarItem = statusBarItem;

  statusBarItem.show();

  setTimeout(() => {
    statusBarItem.dispose();
    disposable.dispose();
    if (activeStatsDisposable === disposable) {
      activeStatsDisposable = null;
    }
    if (activeStatusBarItem === statusBarItem) {
      activeStatusBarItem = null;
    }
  }, 10000);

  vscode.window.showInformationMessage(
    `Copied ${fileCount} files (${totalLines} lines)${modeLabel ? ` - ${modeLabel}` : ""}`,
  );
}
