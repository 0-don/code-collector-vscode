import * as fs from "fs";
import * as path from "path";
import { parserRegistry } from "../parsers";
import { resolverRegistry } from "../resolvers";
import { FileContext } from "../types";

export class FileProcessor {
  async processFile(
    filePath: string,
    contexts: FileContext[],
    processed: Set<string>,
    workspaceRoot: string
  ): Promise<void> {
    const normalizedPath = path.resolve(filePath);

    if (processed.has(normalizedPath) || !fs.existsSync(normalizedPath)) {
      return;
    }

    processed.add(normalizedPath);
    const content = fs.readFileSync(normalizedPath, "utf8");
    const relativePath = path.relative(workspaceRoot, normalizedPath);

    contexts.push({ path: normalizedPath, content, relativePath });

    const parser = parserRegistry.getParser(filePath);
    const resolver = resolverRegistry.getResolver(filePath);

    if (parser && resolver) {
      const imports = parser.parseImports(content, filePath);

      for (const importInfo of imports) {
        const resolvedPath = resolver.resolve(
          importInfo.module,
          path.dirname(normalizedPath),
          workspaceRoot
        );

        if (resolvedPath) {
          await this.processFile(
            resolvedPath,
            contexts,
            processed,
            workspaceRoot
          );
        }
      }
    }
  }
}
