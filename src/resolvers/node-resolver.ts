import { create, ResolveOptionsOptionalFS } from "enhanced-resolve";
import * as fs from "fs";
import * as path from "path";

import { ResolverConfig } from "../types";
import { BaseResolver } from "./base-resolver";

export class NodeResolver extends BaseResolver {
  config: ResolverConfig = {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    configFiles: ["tsconfig.json", "jsconfig.json"],
  };

  private resolverCache = new Map<string, any>();

  resolve(
    importPath: string,
    baseDir: string,
    workspaceRoot: string
  ): string | null {
    const resolver = this.getResolver(workspaceRoot);

    try {
      const resolved = resolver(baseDir, importPath);
      return resolved && !resolved.includes("node_modules") ? resolved : null;
    } catch {
      return null;
    }
  }

  private getResolver(workspaceRoot: string) {
    if (this.resolverCache.has(workspaceRoot)) {
      return this.resolverCache.get(workspaceRoot);
    }

    const configPath = this.findConfig(workspaceRoot);
    const resolverOptions: ResolveOptionsOptionalFS = {
      extensions: this.config.extensions,
      conditionNames: ["node", "import", "require", "default"],
      fileSystem: fs,
    };

    if (configPath) {
      this.applyConfigOptions(configPath, resolverOptions);
    }

    const resolver = create.sync(resolverOptions);
    this.resolverCache.set(workspaceRoot, resolver);
    return resolver;
  }

  private findConfig(workspaceRoot: string): string | null {
    for (const configFile of this.config.configFiles) {
      const configPath = path.join(workspaceRoot, configFile);
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }
    return null;
  }

  private applyConfigOptions(
    configPath: string,
    options: ResolveOptionsOptionalFS
  ): void {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.compilerOptions?.baseUrl || config.compilerOptions?.paths) {
        const baseUrl = config.compilerOptions.baseUrl || ".";
        const absoluteBaseUrl = path.resolve(path.dirname(configPath), baseUrl);

        options.alias = {};
        if (config.compilerOptions.paths) {
          for (const [pattern, paths] of Object.entries(
            config.compilerOptions.paths as Record<string, string[]>
          )) {
            const aliasKey = pattern.replace("/*", "");
            const aliasPath = path.resolve(
              absoluteBaseUrl,
              paths[0].replace("/*", "")
            );
            options.alias[aliasKey] = aliasPath;
          }
        }
      }
    } catch (error) {
      console.log("Error reading config:", error);
    }
  }
}
