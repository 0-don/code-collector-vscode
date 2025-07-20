export interface FileContext {
  path: string;
  content: string;
  relativePath: string;
}

export interface ImportInfo {
  module: string;
  type: "import" | "require" | "dynamic" | "from";
  line?: number;
}

export interface ParserConfig {
  extensions: string[];
  name: string;
}

export interface ResolverConfig {
  extensions: string[];
  configFiles: string[];
}
