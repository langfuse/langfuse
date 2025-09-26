import { logger, LLMAdapter } from "@langfuse/shared/src/server";
import { Langfuse } from "langfuse";
import { env } from "@/src/env.mjs";
import { type FilterCondition } from "@langfuse/shared";

let langfuseClient: Langfuse | null = null;

export function getDefaultModelParams() {
  return {
    provider: "bedrock",
    adapter: LLMAdapter.Bedrock,
    model: env.LANGFUSE_AWS_BEDROCK_MODEL ?? "",
    temperature: 0.1,
    maxTokens: 1000,
    topP: 0.9,
  };
}

export function parseFiltersFromCompletion(
  completion: string,
): FilterCondition[] {
  const completionStr = completion as string;

  try {
    // Try to extract JSON array from the response
    let jsonMatch = completionStr.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      // If no array found, try to find just the JSON content
      jsonMatch = completionStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        // Wrap single object in array
        jsonMatch[0] = `[${jsonMatch[0]}]`;
      }
    }

    if (jsonMatch) {
      const parsedFilters = JSON.parse(jsonMatch[0]);

      if (Array.isArray(parsedFilters)) {
        logger.info(`Successfully parsed ${parsedFilters.length} filters`);
        return parsedFilters;
      }
    }

    // If parsing fails, try to parse the entire response as JSON
    const fallbackFilters = JSON.parse(completionStr);
    if (Array.isArray(fallbackFilters)) {
      return fallbackFilters;
    }
  } catch (error) {
    logger.info(`Failed to parse filters from completion: ${error}`);
  }
  // If parsing fails, always return an empty array
  return [];
}

export function getLangfuseClient(
  publicKey: string,
  secretKey: string,
  baseUrl?: string,
): Langfuse {
  if (!langfuseClient) {
    langfuseClient = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
    });
  }
  return langfuseClient;
}
