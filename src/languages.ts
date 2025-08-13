export const javascriptExtensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".es6",
  ".es",
  ".mts",
  ".cts",
  ".vue",
  ".svelte",
  ".astro",
  ".mdx",
] as const;

export const jvmExtensions = [".java", ".kt"] as const;

export const pythonExtensions = [".py"] as const;

export const supportedExtensions = [
  ...javascriptExtensions,
  ...jvmExtensions,
  ...pythonExtensions,
] as const;
