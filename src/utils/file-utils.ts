import * as fs from "fs";

export function isTextFile(filePath: string): boolean {
  try {
    const buffer = fs.readFileSync(filePath, { flag: "r" }).slice(0, 1024);

    if (buffer.includes(0)) {
      return false;
    }

    try {
      const text = buffer.toString("utf8");
      if (text.includes("\uFFFD")) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

export function isSupportedFile(filePath: string): boolean {
  const supportedExtensions = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".java",
  ];
  return supportedExtensions.some((ext) => filePath.endsWith(ext));
}
