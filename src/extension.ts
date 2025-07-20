import { create, ResolveOptionsOptionalFS } from "enhanced-resolve";
import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import * as vscode from "vscode";

interface FileContext {
  path: string;
  content: string;
  relativePath: string;
}

export function activate(context: vscode.ExtensionContext) {
  const gatherImportsDisposable = vscode.commands.registerCommand(
    "code-collector.gatherImports",
    async (uri: vscode.Uri) => {
      try {
        const filePath =
          uri?.fsPath || vscode.window.activeTextEditor?.document.fileName;
        if (!filePath || !isSupportedFile(filePath)) {
          vscode.window.showErrorMessage(
            "Please select a TypeScript or JavaScript file"
          );
          return;
        }

        const contexts = await gatherImportContexts(filePath);
        const output = formatContexts(contexts);

        await vscode.env.clipboard.writeText(output);
        vscode.window.showInformationMessage(
          `Copied context for ${contexts.length} files`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error}`);
      }
    }
  );

  const collectAllDisposable = vscode.commands.registerCommand(
    "code-collector.collectAll",
    async () => {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder open");
          return;
        }

        const contexts = await collectAllFiles(workspaceFolder.uri.fsPath);
        const output = formatContexts(contexts);

        await vscode.env.clipboard.writeText(output);
        vscode.window.showInformationMessage(
          `Copied all code context for ${contexts.length} files`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error}`);
      }
    }
  );

  context.subscriptions.push(gatherImportsDisposable, collectAllDisposable);
}

function isTextFile(filePath: string): boolean {
  try {
    // Read first 1KB to detect binary content
    const buffer = fs.readFileSync(filePath, { flag: "r" }).slice(0, 1024);

    // Check for null bytes (strong indicator of binary content)
    if (buffer.includes(0)) {
      return false;
    }

    // Try to decode as UTF-8
    try {
      const text = buffer.toString("utf8");
      // Check if the decoded text contains replacement characters
      // which indicates invalid UTF-8 sequences
      if (text.includes("\uFFFD")) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  } catch (error) {
    return false;
  }
}

async function collectAllFiles(workspaceRoot: string): Promise<FileContext[]> {
  const config = vscode.workspace.getConfiguration("codeCollector");

  const defaultIgnorePatterns =
    config.inspect<string[]>("ignorePatterns")?.defaultValue || [];
  const userIgnorePatterns = config.get<string[]>("ignorePatterns", []);

  const ignorePatterns = [...defaultIgnorePatterns, ...userIgnorePatterns];

  const contexts: FileContext[] = [];
  const files = await vscode.workspace.findFiles(
    "**/*",
    `{${ignorePatterns.join(",")}}`
  );

  for (const file of files) {
    const filePath = file.fsPath;

    // Skip if not a text file
    if (!isTextFile(filePath)) {
      continue;
    }

    try {
      const content = fs.readFileSync(filePath, "utf8");
      const relativePath = path.relative(workspaceRoot, filePath);
      contexts.push({ path: filePath, content, relativePath });
    } catch (error) {
      console.log(`Failed to read file ${filePath}:`, error);
    }
  }

  return contexts;
}

function isSupportedFile(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath);
}

async function gatherImportContexts(filePath: string): Promise<FileContext[]> {
  const contexts: FileContext[] = [];
  const processed = new Set<string>();
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";

  const resolver = createResolver(workspaceRoot);

  await processFile(filePath, contexts, processed, workspaceRoot, resolver);
  return contexts;
}

function createResolver(workspaceRoot: string) {
  const tsConfigPath = findTsConfig(workspaceRoot);

  const resolverOptions: ResolveOptionsOptionalFS = {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    conditionNames: ["node", "import", "require", "default"],
    fileSystem: fs,
  };

  if (tsConfigPath) {
    try {
      const tsConfig = JSON.parse(fs.readFileSync(tsConfigPath, "utf8"));
      if (
        tsConfig.compilerOptions?.baseUrl ||
        tsConfig.compilerOptions?.paths
      ) {
        const baseUrl = tsConfig.compilerOptions.baseUrl || ".";
        const absoluteBaseUrl = path.resolve(
          path.dirname(tsConfigPath),
          baseUrl
        );

        resolverOptions.alias = {};
        if (tsConfig.compilerOptions.paths) {
          for (const [pattern, paths] of Object.entries(
            tsConfig.compilerOptions.paths as Record<string, string[]>
          )) {
            const aliasKey = pattern.replace("/*", "");
            const aliasPath = path.resolve(
              absoluteBaseUrl,
              paths[0].replace("/*", "")
            );
            resolverOptions.alias[aliasKey] = aliasPath;
          }
        }
      }
    } catch (error) {
      console.log("Error reading tsconfig:", error);
    }
  }

  return create.sync(resolverOptions);
}

function findTsConfig(workspaceRoot: string): string | null {
  const tsConfigPath = path.join(workspaceRoot, "tsconfig.json");
  if (fs.existsSync(tsConfigPath)) {
    return tsConfigPath;
  }

  const jsConfigPath = path.join(workspaceRoot, "jsconfig.json");
  if (fs.existsSync(jsConfigPath)) {
    return jsConfigPath;
  }

  return null;
}

async function processFile(
  filePath: string,
  contexts: FileContext[],
  processed: Set<string>,
  workspaceRoot: string,
  resolver: any
): Promise<void> {
  const normalizedPath = path.resolve(filePath);
  if (processed.has(normalizedPath) || !fs.existsSync(normalizedPath)) {
    return;
  }

  processed.add(normalizedPath);
  const content = fs.readFileSync(normalizedPath, "utf8");
  const relativePath = path.relative(workspaceRoot, normalizedPath);

  contexts.push({ path: normalizedPath, content, relativePath });

  const imports = getImportsFromAST(
    content,
    path.dirname(normalizedPath),
    resolver,
    filePath
  );
  for (const importPath of imports) {
    await processFile(importPath, contexts, processed, workspaceRoot, resolver);
  }
}

function getImportsFromAST(
  content: string,
  baseDir: string,
  resolver: any,
  filePath: string
): string[] {
  const isTypeScript = /\.(ts|tsx)$/.test(filePath);
  const scriptTarget = isTypeScript
    ? ts.ScriptTarget.Latest
    : ts.ScriptTarget.ES2020;
  const scriptKind = getScriptKind(filePath);

  const sourceFile = ts.createSourceFile(
    path.basename(filePath),
    content,
    scriptTarget,
    true,
    scriptKind
  );

  const imports: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
      const resolved = resolveImport(moduleSpecifier, baseDir, resolver);
      if (resolved) {
        imports.push(resolved);
      }
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arg = node.arguments[0];
      if (ts.isStringLiteral(arg)) {
        const resolved = resolveImport(arg.text, baseDir, resolver);
        if (resolved) {
          imports.push(resolved);
        }
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length > 0
    ) {
      const arg = node.arguments[0];
      if (ts.isStringLiteral(arg)) {
        const resolved = resolveImport(arg.text, baseDir, resolver);
        if (resolved) {
          imports.push(resolved);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}

function getScriptKind(filePath: string): ts.ScriptKind {
  const ext = path.extname(filePath);
  switch (ext) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".ts":
      return ts.ScriptKind.TS;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".mjs":
      return ts.ScriptKind.JS;
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.JS;
  }
}

function resolveImport(
  importPath: string,
  baseDir: string,
  resolver: any
): string | null {
  try {
    const resolved = resolver(baseDir, importPath);
    return resolved && !resolved.includes("node_modules") ? resolved : null;
  } catch {
    return null;
  }
}

function formatContexts(contexts: FileContext[]): string {
  let currentLine = 1;
  let output = "";

  for (const { relativePath, content } of contexts) {
    const lines = content.split("\n");
    const endLine = currentLine + lines.length - 1;
    output += `\n### ${relativePath} (L${currentLine}-L${endLine})\n${content}\n`;
    currentLine = endLine + 1;
  }

  return output;
}

export function deactivate() {}
