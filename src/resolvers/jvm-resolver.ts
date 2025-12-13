import { XMLParser } from "fast-xml-parser";
import * as fs from "fs";
import * as path from "path";
import { jvmExtensions } from "../lib/languages";
import { ResolverConfig } from "../types";
import { BaseResolver } from "./base-resolver";

interface MavenProject {
  project?: {
    modules?: Array<{ module?: string[] }>;
    properties?: Record<string, any>;
  };
}

interface GradleSettings {
  include?: string | string[];
  rootProject?: { name?: string };
}

interface GradleBuild {
  sourceSets?: Record<
    string,
    {
      java?: {
        srcDirs?: string | string[];
      };
      kotlin?: {
        srcDirs?: string | string[];
      };
    }
  >;
}

export class JvmResolver extends BaseResolver {
  config: ResolverConfig = {
    extensions: [...jvmExtensions],
    configFiles: [
      "pom.xml",
      "build.gradle",
      "build.gradle.kts",
      "settings.gradle",
      "settings.gradle.kts",
      "module-info.java",
    ],
  };

  private projectInfoCache = new Map<string, ProjectInfo>();

  async resolve(
    importPath: string,
    baseDir: string,
    workspaceRoot: string,
  ): Promise<string | null> {
    const classPath = importPath.replace(/\./g, "/");
    const projectInfo = await this.getProjectInfo(workspaceRoot);

    // Try all source directories from project analysis
    for (const sourceDir of projectInfo.sourceDirs) {
      // Try both .java and .kt extensions
      for (const ext of [".java", ".kt"]) {
        const fullPath = path.join(sourceDir, classPath + ext);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }

    return null;
  }

  private async getProjectInfo(workspaceRoot: string): Promise<ProjectInfo> {
    if (this.projectInfoCache.has(workspaceRoot)) {
      return this.projectInfoCache.get(workspaceRoot)!;
    }

    const info: ProjectInfo = {
      type: "simple",
      sourceDirs: [],
      modules: [],
    };

    // Check for Maven
    if (this.isMavenProject(workspaceRoot)) {
      info.type = "maven";
      await this.setupMavenProject(workspaceRoot, info);
    }
    // Check for Gradle
    else if (this.isGradleProject(workspaceRoot)) {
      info.type = "gradle";
      await this.setupGradleProject(workspaceRoot, info);
    }
    // Fallback to simple JVM project
    else {
      info.sourceDirs = this.getDefaultSourceDirs(workspaceRoot);
    }

    this.projectInfoCache.set(workspaceRoot, info);
    return info;
  }

  private async setupMavenProject(
    workspaceRoot: string,
    info: ProjectInfo,
  ): Promise<void> {
    try {
      const xmlParser = new XMLParser({
        ignoreAttributes: false,
        parseAttributeValue: true,
        trimValues: true,
      });

      const pomPath = path.join(workspaceRoot, "pom.xml");

      if (fs.existsSync(pomPath)) {
        const pomContent = fs.readFileSync(pomPath, "utf8");
        const result: MavenProject = xmlParser.parse(pomContent);

        // Add main source directories for both Java and Kotlin
        info.sourceDirs.push(path.join(workspaceRoot, "src/main/java"));
        info.sourceDirs.push(path.join(workspaceRoot, "src/main/kotlin"));
        info.sourceDirs.push(path.join(workspaceRoot, "src/test/java"));
        info.sourceDirs.push(path.join(workspaceRoot, "src/test/kotlin"));

        // Check for modules
        const modules = result?.project?.modules?.[0]?.module || [];
        for (const module of modules) {
          const modulePath = path.join(workspaceRoot, module);
          info.modules.push(module);
          info.sourceDirs.push(path.join(modulePath, "src/main/java"));
          info.sourceDirs.push(path.join(modulePath, "src/main/kotlin"));
          info.sourceDirs.push(path.join(modulePath, "src/test/java"));
          info.sourceDirs.push(path.join(modulePath, "src/test/kotlin"));
        }
      }
    } catch (error) {
      // Fallback to convention
      info.sourceDirs.push(path.join(workspaceRoot, "src/main/java"));
      info.sourceDirs.push(path.join(workspaceRoot, "src/main/kotlin"));
      info.sourceDirs.push(path.join(workspaceRoot, "src/test/java"));
      info.sourceDirs.push(path.join(workspaceRoot, "src/test/kotlin"));
    }

    // Filter to only existing directories
    info.sourceDirs = info.sourceDirs.filter((dir) => fs.existsSync(dir));
  }

  private async setupGradleProject(
    workspaceRoot: string,
    info: ProjectInfo,
  ): Promise<void> {
    try {
      const g2js = await import("gradle-to-js/lib/parser");

      // Parse settings.gradle for multi-module setup (check both .gradle and .gradle.kts)
      const settingsFiles = ["settings.gradle", "settings.gradle.kts"];
      for (const settingsFile of settingsFiles) {
        const settingsPath = path.join(workspaceRoot, settingsFile);
        if (fs.existsSync(settingsPath)) {
          const settingsObj: GradleSettings =
            await g2js.parseFile(settingsPath);

          // Extract included projects
          if (settingsObj.include) {
            const includes = Array.isArray(settingsObj.include)
              ? settingsObj.include
              : [settingsObj.include];

            for (const include of includes) {
              const moduleName = include.replace(/['"]/g, "");
              const modulePath = path.join(workspaceRoot, moduleName);
              info.modules.push(moduleName);
              info.sourceDirs.push(path.join(modulePath, "src/main/java"));
              info.sourceDirs.push(path.join(modulePath, "src/main/kotlin"));
              info.sourceDirs.push(path.join(modulePath, "src/test/java"));
              info.sourceDirs.push(path.join(modulePath, "src/test/kotlin"));
            }
          }
          break; // Stop after finding first settings file
        }
      }

      // Parse build.gradle for source sets (check both .gradle and .gradle.kts)
      const buildFiles = ["build.gradle", "build.gradle.kts"];
      for (const buildFile of buildFiles) {
        const buildPath = path.join(workspaceRoot, buildFile);
        if (fs.existsSync(buildPath)) {
          const buildObj: GradleBuild = await g2js.parseFile(buildPath);

          // Check for custom source sets
          if (buildObj.sourceSets) {
            Object.keys(buildObj.sourceSets).forEach((sourceSetName) => {
              const sourceSet = buildObj.sourceSets![sourceSetName];

              // Handle Java source directories
              if (sourceSet.java?.srcDirs) {
                const srcDirs = Array.isArray(sourceSet.java.srcDirs)
                  ? sourceSet.java.srcDirs
                  : [sourceSet.java.srcDirs];

                srcDirs.forEach((srcDir: string) => {
                  info.sourceDirs.push(path.join(workspaceRoot, srcDir));
                });
              }

              // Handle Kotlin source directories
              if (sourceSet.kotlin?.srcDirs) {
                const srcDirs = Array.isArray(sourceSet.kotlin.srcDirs)
                  ? sourceSet.kotlin.srcDirs
                  : [sourceSet.kotlin.srcDirs];

                srcDirs.forEach((srcDir: string) => {
                  info.sourceDirs.push(path.join(workspaceRoot, srcDir));
                });
              }
            });
          }
          break; // Stop after finding first build file
        }
      }

      // Always add conventional directories
      info.sourceDirs.push(path.join(workspaceRoot, "src/main/java"));
      info.sourceDirs.push(path.join(workspaceRoot, "src/main/kotlin"));
      info.sourceDirs.push(path.join(workspaceRoot, "src/test/java"));
      info.sourceDirs.push(path.join(workspaceRoot, "src/test/kotlin"));
    } catch (error) {
      // Fallback to convention
      info.sourceDirs.push(path.join(workspaceRoot, "src/main/java"));
      info.sourceDirs.push(path.join(workspaceRoot, "src/main/kotlin"));
      info.sourceDirs.push(path.join(workspaceRoot, "src/test/java"));
      info.sourceDirs.push(path.join(workspaceRoot, "src/test/kotlin"));
    }

    // Filter to only existing directories
    info.sourceDirs = info.sourceDirs.filter((dir) => fs.existsSync(dir));
  }

  private getDefaultSourceDirs(workspaceRoot: string): string[] {
    const sourceDirs = [
      path.join(workspaceRoot, "src/main/java"),
      path.join(workspaceRoot, "src/main/kotlin"),
      path.join(workspaceRoot, "src/test/java"),
      path.join(workspaceRoot, "src/test/kotlin"),
      path.join(workspaceRoot, "src"),
    ];

    return sourceDirs.filter((dir) => fs.existsSync(dir));
  }

  private isMavenProject(workspaceRoot: string): boolean {
    return fs.existsSync(path.join(workspaceRoot, "pom.xml"));
  }

  private isGradleProject(workspaceRoot: string): boolean {
    return (
      fs.existsSync(path.join(workspaceRoot, "build.gradle")) ||
      fs.existsSync(path.join(workspaceRoot, "build.gradle.kts")) ||
      fs.existsSync(path.join(workspaceRoot, "settings.gradle")) ||
      fs.existsSync(path.join(workspaceRoot, "settings.gradle.kts"))
    );
  }
}

interface ProjectInfo {
  type: "maven" | "gradle" | "simple";
  sourceDirs: string[];
  modules: string[];
}
