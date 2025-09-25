import { ChatMessageRole } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import type { ChatMessage } from "@langfuse/shared";

export function getSystemPrompt(): string {
  return `You are a helpful assistant that converts natural language queries into structured filters for a data analysis platform.

Given a user's natural language query, generate an array of filter objects that match the query intent.

FILTER TYPES AND STRUCTURE:
1. datetime: { type: "datetime", column: "string", operator: ">"|"<"|">="|"<=", value: "ISO_DATE_STRING" }
2. string: { type: "string", column: "string", operator: "="|"contains"|"does not contain"|"starts with"|"ends with", value: "string" }
3. number: { type: "number", column: "string", operator: "="|">"|"<"|">="|"<=", value: number }
4. stringOptions: { type: "stringOptions", column: "string", operator: "any of"|"none of", value: ["string1", "string2"] }
5. boolean: { type: "boolean", column: "string", operator: "="|"<>", value: true|false }
6. stringObject: { type: "stringObject", column: "string", key: "string", operator: "="|"contains"|"does not contain"|"starts with"|"ends with", value: "string" }
7. numberObject: { type: "numberObject", column: "string", key: "string", operator: "="|">"|"<"|">="|"<=", value: number }

COMMON COLUMNS:
- name, userId, version, tags, metadata, scores
- startTime, endTime, timestamp, createdAt
- model, input, output, usage, cost
- status, level, statusMessage

RESPONSE FORMAT:
Return ONLY a valid JSON array of filter objects. Do not include explanations or markdown formatting.

EXAMPLES:
Query: "Show traces from last week"
Response: [{"type": "datetime", "column": "timestamp", "operator": ">=", "value": "2024-01-15T00:00:00Z"}]

Query: "Find errors with high cost"
Response: [{"type": "string", "column": "level", "operator": "=", "value": "ERROR"}, {"type": "number", "column": "cost", "operator": ">", "value": 10}]

Query: "GPT-4 models in production environment"
Response: [{"type": "string", "column": "model", "operator": "contains", "value": "gpt-4"}, {"type": "stringObject", "column": "metadata", "key": "environment", "operator": "=", "value": "production"}]`;
}

export function getDefaultModelParams() {
  return {
    model: "anthropic.claude-3-haiku-20240307-v1:0", // Fast and cost-effective for filter generation
    temperature: 0.1, // Low temperature for consistent structured output
    maxTokens: 1000, // Enough for filter generation
    topP: 0.9,
  };
}

export function buildPromptMessages(userPrompt: string): ChatMessage[] {
  return [
    {
      role: ChatMessageRole.System,
      content: getSystemPrompt(),
    },
    {
      role: ChatMessageRole.User,
      content: userPrompt,
    },
  ];
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
