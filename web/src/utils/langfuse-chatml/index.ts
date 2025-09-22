import { ChatMLMapperRegistry } from "./registry";
import { genericMapperV0 } from "./mappers/generic-v0";
import { openAIMapperV0 } from "./mappers/openai-v0";
import { langGraphMapperV0 } from "./mappers/langgraph-v0";
import type { LangfuseChatML } from "./types";

// Create and configure the global registry
const registry = new ChatMLMapperRegistry();

// Register mappers (order by priority - lower numbers first)
registry.register(openAIMapperV0); // Priority 10
registry.register(langGraphMapperV0); // Priority 20
registry.register(genericMapperV0); // Priority 999 (fallback)

console.log(
  "LangfuseChatML registry initialized with mappers:",
  registry.getRegisteredMappers().map((m) => `${m.name}-${m.version}`),
);

export function mapToLangfuseChatML(
  input: unknown,
  output: unknown,
): LangfuseChatML {
  console.log(
    "mapToLangfuseChatML called with:",
    JSON.stringify({ input, output }),
  );

  const mapper = registry.findMapper(input, output) ?? genericMapperV0;
  const result = mapper.map(input, output);

  console.log("mapToLangfuseChatML result:", JSON.stringify(result));
  return result;
}

// Re-export types for consumers
export * from "./types";
export type { ChatMLMapper } from "./mappers/base";
