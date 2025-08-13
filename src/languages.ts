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

export const supportedExtensions = [
  ...javascriptExtensions,
  ".java",
  ".kt",
  ".py",
] as const;


