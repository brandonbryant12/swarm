import { tool } from "ai";
import type { AgentDependencies } from "../types.js";

export interface ToolFactory {
  readonly name: string;
  readonly create: (deps: AgentDependencies) => unknown;
}

export class AgentToolRegistry {
  constructor(private readonly factories: readonly ToolFactory[]) {}

  createToolMap(deps: AgentDependencies): Record<string, unknown> {
    const tools: Record<string, unknown> = {};
    for (const factory of this.factories) {
      tools[factory.name] = factory.create(deps);
    }
    return tools;
  }
}
