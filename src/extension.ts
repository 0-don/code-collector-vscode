import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

interface FileContext {
  path: string;
  content: string;
  relativePath: string;
}

export function activate(context: vscode.ExtensionContext) {
  console.log("Code Collector is now active!");

  const disposable = vscode.commands.registerCommand(
    "code-collector.gatherImports",
    async (uri: vscode.Uri) => {
      try {
        const filePath =
          uri?.fsPath || vscode.window.activeTextEditor?.document.fileName;
        if (!filePath) {
          vscode.window.showErrorMessage("No file selected");
          return;
        }

        vscode.window.showInformationMessage("Gathering import context...");

        const contexts = await gatherImportContexts(filePath);
        const output = formatContexts(contexts);

        await vscode.env.clipboard.writeText(output);
        vscode.window.showInformationMessage(
          `Copied context for ${contexts.length} files to clipboard`
        );

        // Optionally save to file
        await saveToFile(
          output,
          path.basename(filePath, path.extname(filePath))
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error}`);
        console.error("Code Collector error:", error);
      }
    }
  );

  context.subscriptions.push(disposable);
}

async function gatherImportContexts(filePath: string): Promise<FileContext[]> {
  const contexts: FileContext[] = [];
  const processed = new Set<string>();

  await processFile(filePath, contexts, processed);
  return contexts;
}

async function processFile(
  filePath: string,
  contexts: FileContext[],
  processed: Set<string>
): Promise<void> {
  const normalizedPath = path.resolve(filePath);

  if (processed.has(normalizedPath) || !fs.existsSync(normalizedPath)) {
    return;
  }

  processed.add(normalizedPath);

  const content = fs.readFileSync(normalizedPath, "utf8");
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
  const relativePath = workspaceRoot
    ? path.relative(workspaceRoot, normalizedPath)
    : normalizedPath;

  contexts.push({ path: normalizedPath, content, relativePath });

  // Get imports using both language server and fallback parsing
  const imports = await getImports(normalizedPath, content);

  for (const importPath of imports) {
    await processFile(importPath, contexts, processed);
  }
}

async function getImports(
  filePath: string,
  content: string
): Promise<string[]> {
  const imports: string[] = [];

  try {
    // Try language server approach first
    const document = await vscode.workspace.openTextDocument(filePath);
    const languageServerImports = await getImportsFromLanguageServer(document);
    imports.push(...languageServerImports);
  } catch (error) {
    console.log("Language server approach failed, falling back to parsing");
  }

  // Fallback to parsing if language server fails
  if (imports.length === 0) {
    const parsedImports = parseImports(content, path.dirname(filePath));
    imports.push(...parsedImports);
  }

  return imports.filter((imp) => fs.existsSync(imp));
}

async function getImportsFromLanguageServer(
  document: vscode.TextDocument
): Promise<string[]> {
  const imports: string[] = [];

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const importMatch = line.text.match(
      /(?:import.*?from\s+|import\s*\(|require\s*\()\s*['"`]([^'"`]+)['"`]/
    );

    if (importMatch && isLocalImport(importMatch[1])) {
      try {
        const importStart = line.text.indexOf(importMatch[1]);
        const position = new vscode.Position(i, importStart);

        const locations = await vscode.commands.executeCommand<
          vscode.Location[]
        >("vscode.executeDefinitionProvider", document.uri, position);

        if (locations && locations.length > 0) {
          imports.push(locations[0].uri.fsPath);
        }
      } catch (error) {
        // Skip this import if language server fails
      }
    }
  }

  return imports;
}

function parseImports(content: string, baseDir: string): string[] {
  const imports: string[] = [];
  const ext = path.extname(baseDir);

  if ([".ts", ".tsx", ".js", ".jsx"].some((e) => content.includes(e))) {
    imports.push(...parseJavaScriptImports(content, baseDir));
  } else if (ext === ".java" || ext === ".kt") {
    imports.push(...parseJavaKotlinImports(content, baseDir));
  } else if (ext === ".py") {
    imports.push(...parsePythonImports(content, baseDir));
  }

  return imports;
}

function parseJavaScriptImports(content: string, baseDir: string): string[] {
  const imports: string[] = [];
  const importRegexes = [
    /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g,
    /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  ];

  importRegexes.forEach((regex) => {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const importPath = match[1];
      if (isLocalImport(importPath)) {
        const resolved = resolveImportPath(importPath, baseDir);
        if (resolved) {
          imports.push(resolved);
        }
      }
    }
  });

  return imports;
}

function parseJavaKotlinImports(content: string, baseDir: string): string[] {
  const imports: string[] = [];
  // Basic Java/Kotlin import parsing - extend as needed
  const importRegex = /(?:import|package)\s+([a-zA-Z0-9_.]+)/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    // Convert package to file path (basic implementation)
    const packagePath = match[1].replace(/\./g, path.sep);
    const resolved = resolveJavaPath(packagePath, baseDir);
    if (resolved) {
      imports.push(resolved);
    }
  }

  return imports;
}

function parsePythonImports(content: string, baseDir: string): string[] {
  const imports: string[] = [];
  const importRegexes = [
    /from\s+([a-zA-Z0-9_.]+)\s+import/g,
    /import\s+([a-zA-Z0-9_.]+)/g,
  ];

  importRegexes.forEach((regex) => {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith(".")) {
        const resolved = resolvePythonPath(importPath, baseDir);
        if (resolved) {
          imports.push(resolved);
        }
      }
    }
  });

  return imports;
}

function isLocalImport(importPath: string): boolean {
  return importPath.startsWith(".") || importPath.startsWith("@/");
}

function resolveImportPath(importPath: string, baseDir: string): string | null {
  // Handle @/ alias
  if (importPath.startsWith("@/")) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      importPath = path.join(workspaceRoot, "src", importPath.slice(2));
    }
  } else if (importPath.startsWith(".")) {
    importPath = path.resolve(baseDir, importPath);
  } else {
    return null;
  }

  // Try different extensions
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

  return fs.existsSync(importPath) ? importPath : null;
}

function resolveJavaPath(packagePath: string, baseDir: string): string | null {
  // Basic Java file resolution - extend as needed
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return null;
  }

  const srcPath = path.join(
    workspaceRoot,
    "src",
    "main",
    "java",
    packagePath + ".java"
  );
  return fs.existsSync(srcPath) ? srcPath : null;
}

function resolvePythonPath(importPath: string, baseDir: string): string | null {
  // Basic Python relative import resolution
  const resolved = path.resolve(
    baseDir,
    importPath.replace(/\./g, path.sep) + ".py"
  );
  return fs.existsSync(resolved) ? resolved : null;
}

function formatContexts(contexts: FileContext[]): string {
  const header = `# Code Context Collection
Generated on: ${new Date().toISOString()}
Total files: ${contexts.length}

---

`;

  const formattedFiles = contexts
    .map(({ relativePath, content }) => {
      const ext = path.extname(relativePath).slice(1);
      const language = getLanguageForExtension(ext);

      return `## ${relativePath}

\`\`\`${language}
${content}
\`\`\`

`;
    })
    .join("\n");

  return header + formattedFiles;
}

function getLanguageForExtension(ext: string): string {
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    java: "java",
    kt: "kotlin",
    py: "python",
  };
  return langMap[ext] || ext;
}

async function saveToFile(content: string, baseName: string): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  const outputDir = path.join(workspaceRoot, "CodeCollector");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileName = `${baseName}-context-${Date.now()}.md`;
  const filePath = path.join(outputDir, fileName);

  fs.writeFileSync(filePath, content);

  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);
}

export function deactivate() {}
