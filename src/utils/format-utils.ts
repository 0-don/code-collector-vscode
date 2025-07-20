import { FileContext } from "../types";

export function formatContexts(contexts: FileContext[]): string {
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
