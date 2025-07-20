import { BaseParser } from "./base-parser";
import { JavaParser } from "./java-parser";
import { TypeScriptParser } from "./typescript-parser";

export class ParserRegistry {
  private parsers: BaseParser[] = [new TypeScriptParser(), new JavaParser()];

  getParser(filePath: string): BaseParser | null {
    return this.parsers.find((parser) => parser.canHandle(filePath)) || null;
  }

  getSupportedExtensions(): string[] {
    return this.parsers.flatMap((parser) => parser.config.extensions);
  }

  addParser(parser: BaseParser): void {
    this.parsers.push(parser);
  }
}

export const parserRegistry = new ParserRegistry();
