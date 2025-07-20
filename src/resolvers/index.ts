import { BaseResolver } from "./base-resolver";
import { JavaResolver } from "./java-resolver";
import { NodeResolver } from "./node-resolver";

export class ResolverRegistry {
  private resolvers: BaseResolver[] = [new NodeResolver(), new JavaResolver()];

  getResolver(filePath: string): BaseResolver | null {
    return (
      this.resolvers.find((resolver) => resolver.canHandle(filePath)) || null
    );
  }

  addResolver(resolver: BaseResolver): void {
    this.resolvers.push(resolver);
  }
}

export const resolverRegistry = new ResolverRegistry();
