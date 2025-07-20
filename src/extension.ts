import * as vscode from "vscode";
import { CommandHandler } from "./commands";

export function activate(context: vscode.ExtensionContext) {
  const commandHandler = new CommandHandler();

  const gatherImportsDisposable = vscode.commands.registerCommand(
    "code-collector.gatherImports",
    (uri: vscode.Uri, selectedFiles?: vscode.Uri[]) =>
      commandHandler.handleGatherImports(uri, selectedFiles)
  );

  const collectAllDisposable = vscode.commands.registerCommand(
    "code-collector.collectAll",
    () => commandHandler.handleCollectAll()
  );

  context.subscriptions.push(gatherImportsDisposable, collectAllDisposable);
}

export function deactivate() {}
