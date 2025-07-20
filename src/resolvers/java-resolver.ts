import * as fs from "fs";
import * as path from "path";
import { ResolverConfig } from "../types";
import { BaseResolver } from "./base-resolver";

export class JavaResolver extends BaseResolver {
  config: ResolverConfig = {
    extensions: [".java"],
    configFiles: ["pom.xml", "build.gradle", ".classpath"],
  };

  resolve(
    importPath: string,
    baseDir: string,
    workspaceRoot: string
  ): string | null {
    // Handle fully qualified class names
    const classPath = importPath.replace(/\./g, "/") + ".java";

    // Common Java source directories
    const sourceDirs = ["src/main/java", "src/test/java", "src"];

    for (const sourceDir of sourceDirs) {
      const fullPath = path.join(workspaceRoot, sourceDir, classPath);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    return null;
  }
}
