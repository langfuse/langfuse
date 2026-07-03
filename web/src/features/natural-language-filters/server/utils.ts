import { Langfuse } from "langfuse";
import { type FilterCondition, singleFilter } from "@langfuse/shared";
import { z } from "zod";

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
      baseUrl,
      enabled: enabled ?? true,
    });
  }
  return langfuseClient;
}
