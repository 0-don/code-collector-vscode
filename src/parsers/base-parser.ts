import { ImportInfo, ParserConfig } from "../types";

export abstract class BaseParser {
  abstract config: ParserConfig;

  abstract parseImports(
    content: string,
    filePath: string
  ): ImportInfo[] | Promise<ImportInfo[]>;

  canHandle(filePath: string): boolean {
    const ext = filePath.split(".").pop()?.toLowerCase();
    return this.config.extensions.includes(`.${ext}`);
  }
}
