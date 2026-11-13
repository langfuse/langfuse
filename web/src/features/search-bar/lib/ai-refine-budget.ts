import { astToFilterState } from "./adapter";
import { EVENTS_FIELD_REGISTRY, type FieldRegistry } from "./fields";
import { parse } from "./langQ";
import type { ObservedScoreNames } from "./observed-options";

export const AI_FILTER_MAX_OUTPUT_TOKENS = 2048;

export const AI_REFINEMENT_BUDGET_MESSAGE =
  "This filter list is too large to refine with AI. Edit the filters in the search bar or reduce the selection first.";
export const AI_REFINEMENT_INCOMPLETE_MESSAGE =
  "AI could not return a complete refinement. Your filters were not changed. Try a smaller change.";
export const AI_REFINEMENT_FULL_TEXT_MESSAGE =
  "AI cannot preserve full-text search while refining filters. Edit the query in the search bar or remove the full-text search first.";

// Refinement returns a complete JSON FilterState, not a delta. Charge its
// compact UTF-8 representation at one byte per token, conservatively reserving
// half the output allowance for changes and formatting. This avoids assuming
// the usual four characters per token for IDs, escapes, or non-ASCII values.
const MAX_REFINEMENT_PAYLOAD_BYTES = AI_FILTER_MAX_OUTPUT_TOKENS / 2;

export function aiRefinementBudgetError(
  query: string | undefined,
  registry: FieldRegistry = EVENTS_FIELD_REGISTRY,
  scoreNames?: ObservedScoreNames,
): string | null {
  if (!query?.trim()) return null;
  const { ast, valid } = parse(query, registry);
  const scoreTypes = scoreNames
    ? {
        numericScoreNames: scoreNames.numeric && new Set(scoreNames.numeric),
        categoricalScoreNames:
          scoreNames.categorical && new Set(scoreNames.categorical),
        booleanScoreNames: scoreNames.booleans && new Set(scoreNames.booleans),
        traceNumericScoreNames:
          scoreNames.traceNumeric && new Set(scoreNames.traceNumeric),
        traceCategoricalScoreNames:
          scoreNames.traceCategorical && new Set(scoreNames.traceCategorical),
        traceBooleanScoreNames:
          scoreNames.traceBooleans && new Set(scoreNames.traceBooleans),
      }
    : undefined;
  const lowered = astToFilterState(ast, scoreTypes, registry);
  // The AI response owns only FilterState. It has no searchQuery/searchType
  // lanes, so replacing filters cannot faithfully retain full-text scope.
  if (lowered.searchQuery?.trim()) return AI_REFINEMENT_FULL_TEXT_MESSAGE;
  // Invalid or unresolved conditions must still be charged in full. Never
  // estimate a partial lowering after unknown fields or unavailable options.
  const payload =
    !valid || lowered.errors.length > 0
      ? JSON.stringify(query)
      : JSON.stringify(lowered.filters) +
        (lowered.searchQuery ? JSON.stringify(lowered.searchQuery) : "");
  return new TextEncoder().encode(payload).byteLength >
    MAX_REFINEMENT_PAYLOAD_BYTES
    ? AI_REFINEMENT_BUDGET_MESSAGE
    : null;
}
