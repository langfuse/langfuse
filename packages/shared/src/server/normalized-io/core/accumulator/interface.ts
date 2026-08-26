import { NormalizedMessage, ToolDefinition } from "../../types";

export type NormalizedIOAccumulator = {
  messages: NormalizedMessage[];
  toolDefinitions: ToolDefinition[];
  toolDefinitionIndexByName: Map<string, number>;
  toolCallKeys: Record<"input" | "output", Set<string>>;
};

export function createAccumulator(): NormalizedIOAccumulator {
  return {
    messages: [],
    toolDefinitions: [],
    toolDefinitionIndexByName: new Map(),
    toolCallKeys: { input: new Set(), output: new Set() },
  };
}
