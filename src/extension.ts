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
  const disposable = vscode.commands.registerCommand(
    "code-collector.gatherImports",
    async (uri: vscode.Uri) => {
      try {
        const filePath =
          uri?.fsPath || vscode.window.activeTextEditor?.document.fileName;
        if (
          !filePath ||
          (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx"))
        ) {
          vscode.window.showErrorMessage("Please select a TypeScript file");
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

  context.subscriptions.push(disposable);
}

async function gatherImportContexts(filePath: string): Promise<FileContext[]> {
  const contexts: FileContext[] = [];
  const processed = new Set<string>();
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";

  // Load tsconfig for path resolution
  const tsConfig = loadTsConfig(workspaceRoot);

  await processFile(filePath, contexts, processed, workspaceRoot, tsConfig);
  return contexts;
}

async function processFile(
  filePath: string,
  contexts: FileContext[],
  processed: Set<string>,
  workspaceRoot: string,
  tsConfig: any
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
    tsConfig
  );

  for (const importPath of imports) {
    await processFile(importPath, contexts, processed, workspaceRoot, tsConfig);
  }
}

function getImportsFromAST(
  content: string,
  baseDir: string,
  tsConfig: any
): string[] {
  const sourceFile = ts.createSourceFile(
    "temp.ts",
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const imports: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
      if (isLocalImport(moduleSpecifier)) {
        const resolved = resolveImport(moduleSpecifier, baseDir, tsConfig);
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

function isLocalImport(importPath: string): boolean {
  return importPath.startsWith(".") || importPath.startsWith("@/");
}

function resolveImport(
  importPath: string,
  baseDir: string,
  tsConfig: any
): string | null {
  // Handle path mapping from tsconfig
  if (tsConfig?.compilerOptions?.paths) {
    for (const [pattern, paths] of Object.entries(
      tsConfig.compilerOptions.paths
    )) {
      const regex = new RegExp(pattern.replace("*", "(.*)"));
      const match = importPath.match(regex);
      if (match) {
        const replacement = (paths as string[])[0].replace("*", match[1] || "");
        const workspaceRoot =
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
        importPath = path.resolve(workspaceRoot, replacement);
        break;
      }
    }
  }

  // Handle relative imports
  if (importPath.startsWith(".")) {
    importPath = path.resolve(baseDir, importPath);
  }

  // Try extensions
  const extensions = [".ts", ".tsx", ".js", ".jsx"];
  for (const ext of extensions) {
    const fullPath = importPath + ext;
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  // Try index files
  for (const ext of extensions) {
    const indexPath = path.join(importPath, "index" + ext);
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
  }

  return null;
}

function loadTsConfig(workspaceRoot: string): ts.ParsedCommandLine | null {
  const configPath = ts.findConfigFile(
    workspaceRoot,
    ts.sys.fileExists,
    "tsconfig.json"
  );
  if (!configPath) {
    return null;
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    return null;
  }

  return ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath)
  );
}

function formatContexts(contexts: FileContext[]): string {
  let currentLine = 1;
  let output = "";

  for (const { relativePath, content } of contexts) {
    const lines = content.split("\n");
    const endLine = currentLine + lines.length - 1;

    output += `\n// ${relativePath} (L${currentLine}-L${endLine})\n${content}\n`;
    currentLine = endLine + 1;
  }

  return output;
}
