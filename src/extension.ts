import * as vscode from "vscode";
import { CommandHandler } from "./commands";
import { OutputManager } from "./output";

export function activate(context: vscode.ExtensionContext) {
  const output = OutputManager.getInstance();
  output.log("Extension activated");

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

  const showOutputDisposable = vscode.commands.registerCommand(
    "code-collector.showOutput",
    () => output.show()
  );

  context.subscriptions.push(
    gatherImportsDisposable,
    collectAllDisposable,
    showOutputDisposable,
    { dispose: () => output.dispose() }
  );
}

export function deactivate() {
  const output = OutputManager.getInstance();
  output.log("Extension deactivated");
  output.dispose();
}
