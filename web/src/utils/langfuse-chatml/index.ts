import { genericMapper } from "./mappers/generic";
import { openAIMapper } from "./mappers/openai";
import { langGraphMapper } from "./mappers/langgraph";
import { langChainMapper } from "./mappers/langchain";
import { pydanticMapper } from "./mappers/pydantic";
import type { LangfuseChatML } from "./types";
import type { ChatMLMapper } from "./mappers/base";
import { parseMetadata } from "./mappers/utils";

const mappers: ChatMLMapper[] = [
  openAIMapper,
  langGraphMapper,
  langChainMapper,
  pydanticMapper,
  genericMapper, // Fallback
];

// TODO: Cache the parsed result to not parse twice (in findBestMapper and mapToLangfuseChatML)
function findBestMapper(
  input: unknown,
  output: unknown,
  metadata?: unknown,
): ChatMLMapper {
  const scored = mappers.map((mapper) => ({
    mapper,
    score: mapper.canMapScore(input, output, metadata),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Try map in order until success
  for (const { mapper, score } of scored) {
    // Skip zero-score non-generic mappers
    if (score === 0 && mapper.mapperName !== "generic") continue;

    try {
      const result = mapper.map(input, output, metadata);
      const hasData =
        result.input.messages.length > 0 || result.output.messages.length > 0;
      if (hasData) return mapper;
    } catch {
      // next mapper
      continue;
    }
  }

  // Fallback to generic (should always work)
  return genericMapper;
}

export function mapToLangfuseChatML(
  input: unknown,
  output: unknown,
  metadata?: unknown,
): LangfuseChatML {
  const mapper = findBestMapper(input, output, metadata);
  const result = mapper.map(input, output, metadata);

  // TODO: remove ls_... checks
  const meta = parseMetadata(metadata);
  if (meta) {
    const dataSource =
      (meta.ls_provider as string) || (meta.framework as string);
    const dataSourceVersion = meta.ls_version as string;

    if (dataSource) {
      result.dataSource = dataSource;
    }
    if (dataSourceVersion) {
      result.dataSourceVersion = dataSourceVersion;
    }
  }

  result._selectedMapper = mapper.mapperName; // just for debug

  return result;
}

export * from "./types";
export type { ChatMLMapper } from "./mappers/base";
