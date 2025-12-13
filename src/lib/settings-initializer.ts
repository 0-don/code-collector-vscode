import * as vscode from "vscode";

export class SettingsInitializer {
  static async initializeDefaultSettings(): Promise<void> {
    const config = vscode.workspace.getConfiguration("codeCollector");
    const inspection = config.inspect("ignorePatterns");

    // Only add if user hasn't configured anything yet
    if (!inspection?.globalValue && !inspection?.workspaceValue) {
      await this.addExampleSettings();
    }
  }

  private static async addExampleSettings(): Promise<void> {
    const examplePatterns = ["**/node_modules/**", "*.svg"];

    try {
      await vscode.workspace
        .getConfiguration()
        .update(
          "codeCollector.ignorePatterns",
          examplePatterns,
          vscode.ConfigurationTarget.Global,
        );
    } catch (error) {
      // Silently fail - default settings are optional
    }
  }
}
