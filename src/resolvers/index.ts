import { BaseResolver } from "./base-resolver";
import { JvmResolver } from "./jvm-resolver";
import { NodeResolver } from "./node-resolver";
import { PythonResolver } from "./python-resolver";

export class ResolverRegistry {
  private resolvers: BaseResolver[] = [
    new NodeResolver(),
    new JvmResolver(),
    new PythonResolver(),
  ];

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
