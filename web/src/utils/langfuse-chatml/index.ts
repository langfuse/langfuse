import { genericMapper } from "./mappers/generic";
import { openAIMapper } from "./mappers/openai";
import { langGraphMapper } from "./mappers/langgraph";
import type { LangfuseChatML } from "./types";
import type { ChatMLMapper } from "./mappers/base";

// order matters: more specific mappers first
// TODO: make mappers mutually exclusive and add a test for that
const mappers: ChatMLMapper[] = [
  openAIMapper, // Try OpenAI-specific detection first
  langGraphMapper, // Then LangGraph-specific detection
  genericMapper, // Always matches (fallback)
];

function findBestMapper(
  input: unknown,
  output: unknown,
  dataSource?: string,
  dataSourceVersion?: string,
): ChatMLMapper {
  for (const mapper of mappers) {
    if (mapper.canMap(input, output, dataSource, dataSourceVersion)) {
      return mapper;
    }
  }

  // Fallback, never reach since generic canMap returns true
  return genericMapper;
}

export function mapToLangfuseChatML(
  input: unknown,
  output: unknown,
  dataSource?: string,
  dataSourceVersion?: string,
): LangfuseChatML {
  // Find the best mapper based on metadata and structural detection
  const mapper = findBestMapper(input, output, dataSource, dataSourceVersion);

  const result = mapper.map(input, output);

  if (dataSource) {
    result.dataSource = dataSource;
  }
  if (dataSourceVersion) {
    result.dataSourceVersion = dataSourceVersion;
  }

  return result;
}

// Re-export types for consumers
export * from "./types";
export type { ChatMLMapper } from "./mappers/base";
