declare module "gradle-to-js/lib/parser" {
  export interface GradleParseResult {
    [key: string]: any;
    include?: string | string[];
    sourceSets?: {
      [sourceSetName: string]: {
        java?: {
          srcDirs?: string | string[];
        };
        resources?: {
          srcDirs?: string | string[];
        };
      };
    };
    dependencies?: {
      [configurationName: string]: string | string[];
    };
    plugins?: Array<string | { id: string; version?: string }>;
    repositories?: Array<string | { [key: string]: any }>;
  }

  export function parseFile(filePath: string): Promise<GradleParseResult>;
  export function parseText(text: string): Promise<GradleParseResult>;
}
