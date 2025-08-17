import * as vscode from "vscode";
import { CommandHandler } from "./commands";
import { OutputManager } from "./output";
import { SettingsInitializer } from "./settings-initializer";

export async function activate(context: vscode.ExtensionContext) {
  const output = OutputManager.getInstance();
  output.log("Extension activated");

  // Initialize settings with examples if user has no configuration
  await SettingsInitializer.initializeDefaultSettings();

  const commandHandler = new CommandHandler();

  const gatherImportsDisposable = vscode.commands.registerCommand(
    "code-collector.gatherImports",
    (uri: vscode.Uri, selectedFiles?: vscode.Uri[]) =>
      commandHandler.handleGatherImports(uri, selectedFiles)
  );

  const gatherDirectDisposable = vscode.commands.registerCommand(
    "code-collector.gatherDirect",
    (uri: vscode.Uri, selectedFiles?: vscode.Uri[]) =>
      commandHandler.handleGatherDirect(uri, selectedFiles)
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
    gatherDirectDisposable,
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
