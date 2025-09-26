import { ChatMessageRole } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import type { ChatMessage } from "@langfuse/shared";
import { Langfuse } from "langfuse";

let langfuseClient: Langfuse | null = null;

export function getDefaultModelParams() {
  return {
    model: "anthropic.claude-3-haiku-20240307-v1:0",
    temperature: 0.1,
    maxTokens: 1000,
    topP: 0.9,
  };
}

export function parseFiltersFromCompletion(completion: string): unknown[] {
  const completionStr = completion as string;

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

  throw new Error("Response is not a valid filter array");
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
