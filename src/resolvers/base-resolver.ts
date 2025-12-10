import { ResolverConfig } from "../types";

export abstract class BaseResolver {
  abstract config: ResolverConfig;

  abstract resolve(
    importPath: string,
    baseDir: string,
    workspaceRoot: string,
  ): Promise<string | null> | string | null;

  canHandle(filePath: string): boolean {
    const ext = filePath.split(".").pop()?.toLowerCase();
    return this.config.extensions.includes(`.${ext}`);
  }
}
