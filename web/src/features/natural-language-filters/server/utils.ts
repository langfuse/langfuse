import { LLMAdapter } from "@langfuse/shared/src/server";
import { Langfuse } from "langfuse";
import { env } from "@/src/env.mjs";
import { type FilterCondition, singleFilter } from "@langfuse/shared";
import { z } from "zod";

let langfuseClient: Langfuse | null = null;

export function getDefaultModelParams() {
  // Intentionally omit `temperature` and `top_p`: newer Bedrock models such as
  // Claude Opus 4.8 reject these inference params with a ValidationException
  // ("'temperature' is deprecated for this model"), which surfaces as a 500 on
  // `naturalLanguageFilters.createCompletion`. Omitting them is robust across
  // models (older models simply fall back to their defaults), and NL filter
  // generation works fine at model defaults. We only cap output length.
  // Note: the param keys are `max_tokens`/`top_p` (snake_case) per ModelParams;
  // the previous camelCase `maxTokens`/`topP` were silently dropped.
  return {
    provider: "bedrock",
    adapter: LLMAdapter.Bedrock,
    model: env.LANGFUSE_AWS_BEDROCK_MODEL ?? "",
    max_tokens: 1000,
  };
}

const FilterArraySchema = z.array(singleFilter);

export function parseFiltersFromCompletion(
  completion: string,
): FilterCondition[] {
  const arrayMatch = completion.match(/\[[\s\S]*?\]/)?.[0];
  const objectMatch = completion.match(/\{[\s\S]*?\}/)?.[0];

  const candidates = [
    completion, // full response
    arrayMatch, // extract JSON array
    objectMatch ? `[${objectMatch}]` : undefined, // wrap single object in array
  ].filter((c): c is string => Boolean(c));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);

      // sometimes, ai returns {filters: [...]}, extract the filters array
      const filtersArray = parsed.filters || parsed;
      const validated = FilterArraySchema.parse(filtersArray);
      return validated;
    } catch {
      // try next candidate
    }
  }
  return [];
}

export function getLangfuseClient(
  publicKey: string,
  secretKey: string,
  baseUrl?: string,
  enabled?: boolean,
): Langfuse {
  if (!langfuseClient) {
    langfuseClient = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
      enabled: enabled ?? true,
    });
  }
  return langfuseClient;
}
