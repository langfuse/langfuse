import { NormalizedMessage, ToolDefinition } from "../../types";

export type NormalizedIOAccumulator = {
  messages: NormalizedMessage[];
  toolDefinitions: ToolDefinition[];
  toolDefinitionIndexByName: Map<string, number>;
  unparsedKeys: {
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
  };
};

export function createAccumulator(): NormalizedIOAccumulator {
  return {
    messages: [],
    toolDefinitions: [],
    toolDefinitionIndexByName: new Map(),
    unparsedKeys: {},
  };
}
