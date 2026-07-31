import { Langfuse } from "langfuse";
import { type FilterCondition, singleFilter } from "@langfuse/shared";
import { z } from "zod";
import { getProductBaseUrl } from "@/src/utils/base-url";

let langfuseClient: Langfuse | null = null;

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
      // Without LANGFUSE_AI_FEATURES_HOST the SDK would default to
      // cloud.langfuse.com; self-referential deployments (e.g. PR previews)
      // must talk to themselves instead.
      baseUrl: baseUrl ?? getProductBaseUrl().toString(),
      enabled: enabled ?? true,
    });
  }
  return langfuseClient;
}
