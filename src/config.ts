import * as vscode from "vscode";

export class ConfigManager {
  private static instance: ConfigManager;

  private constructor() {}

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  getIgnorePatterns(): string[] {
    const config = vscode.workspace.getConfiguration("codeCollector");
    const defaultIgnorePatterns =
      config.inspect<string[]>("ignorePatterns")?.defaultValue || [];
    const userIgnorePatterns = config.get<string[]>("ignorePatterns", []);
    return [...defaultIgnorePatterns, ...userIgnorePatterns];
  }

  getIgnorePatternsGlob(): string {
    return `{${this.getIgnorePatterns().join(",")}}`;
  }
}

// Global helper function
export const getIgnorePatterns = (): string[] => {
  return ConfigManager.getInstance().getIgnorePatterns();
};

export const getIgnorePatternsGlob = (): string => {
  return ConfigManager.getInstance().getIgnorePatternsGlob();
};
