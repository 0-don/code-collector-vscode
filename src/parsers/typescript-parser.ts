import * as path from "path";
import * as ts from "typescript";
import { ImportInfo, ParserConfig } from "../types";
import { BaseParser } from "./base-parser";

export class TypeScriptParser extends BaseParser {
  config: ParserConfig = {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    name: "TypeScript/JavaScript",
  };

  parseImports(content: string, filePath: string): ImportInfo[] {
    const isTypeScript = /\.(ts|tsx)$/.test(filePath);
    const scriptTarget = isTypeScript
      ? ts.ScriptTarget.Latest
      : ts.ScriptTarget.ES2020;
    const scriptKind = this.getScriptKind(filePath);

    const sourceFile = ts.createSourceFile(
      path.basename(filePath),
      content,
      scriptTarget,
      true,
      scriptKind
    );

    const imports: ImportInfo[] = [];

    const visit = (node: ts.Node) => {
      // ES6 import declarations
      if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
        const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
        imports.push({
          module: moduleSpecifier,
          type: "import",
          line:
            sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        });
      }

      // Dynamic imports
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const arg = node.arguments[0];
        if (ts.isStringLiteral(arg)) {
          imports.push({
            module: arg.text,
            type: "dynamic",
            line:
              sourceFile.getLineAndCharacterOfPosition(node.getStart()).line +
              1,
          });
        }
      }

      // Require calls
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require" &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0];
        if (ts.isStringLiteral(arg)) {
          imports.push({
            module: arg.text,
            type: "require",
            line:
              sourceFile.getLineAndCharacterOfPosition(node.getStart()).line +
              1,
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return imports;
  }

  private getScriptKind(filePath: string): ts.ScriptKind {
    const ext = path.extname(filePath);
    switch (ext) {
      case ".tsx":
        return ts.ScriptKind.TSX;
      case ".ts":
        return ts.ScriptKind.TS;
      case ".jsx":
        return ts.ScriptKind.JSX;
      case ".mjs":
      case ".cjs":
      default:
        return ts.ScriptKind.JS;
    }
  }
}
