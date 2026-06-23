// Registry-derived system prompt for the v4 search-bar AI filter generator.
//
// v4 ONLY. This prompt is consumed solely by `searchBar.generateFilter`. The v3
// natural-language filter (`naturalLanguageFilters.createCompletion`) uses a
// SEPARATE, remotely-managed prompt (`get-filter-conditions-from-query`) and is
// unaffected by changes here — keep the two prompts separate.
//
// The prompt is generated from the SAME field registry the grammar, validator,
// and reverse adapter use (`../lib/fields`), so the model's entire vocabulary IS
// the bar grammar — it can only be told to emit columns/operators the bar can
// render as pills. This is why a v4-native endpoint beats the legacy
// trace-column prompt: there is no separate column list to drift out of sync.
//
// The model is asked for a flat Langfuse `FilterState` (an array of
// `singleFilter` objects). Each field's allowed `type`/operators/value shape is
// DERIVED from its `kind`/`syncMode` here, mirroring `lowerSingle` in
// `../lib/filter-state-to-query.ts` (the reverse direction), so the two cannot
// diverge.

import { FIELDS, SCORE_COLUMNS, type FieldDef } from "../lib/fields";

/** The flat-FilterState `type`, operators, and value shape a field lowers to. */
type FilterSpec = {
  type: string;
  operators: string;
  value: string;
};

export function specForField(field: FieldDef): FilterSpec {
  switch (field.kind) {
    case "number":
      return {
        type: "number",
        operators: `"=", ">", "<", ">=", "<="`,
        value: "a number (not a string)",
      };
    case "datetime":
      return {
        type: "datetime",
        operators: `">", "<", ">=", "<="`,
        value: "an ISO 8601 datetime string",
      };
    case "boolean":
      return {
        type: "boolean",
        operators: `"=", "<>"`,
        value: "true or false (a JSON boolean)",
      };
    case "text":
      if (field.syncMode === "exactOption") {
        return {
          type: "stringOptions",
          operators: `"any of", "none of"`,
          value: "an array of strings",
        };
      }
      if (field.syncMode === "arrayOption") {
        return {
          type: "arrayOptions",
          operators: `"any of", "none of", "all of"`,
          value: "an array of strings",
        };
      }
      // textSearch — substring / exact match on a free-text column.
      return {
        type: "string",
        operators: `"=", "contains", "does not contain", "starts with", "ends with"`,
        value: "a single string",
      };
  }
}

function fieldCatalogLine(field: FieldDef): string {
  const spec = specForField(field);
  const aliases =
    field.aliases.length > 0 ? ` [aliases: ${field.aliases.join(", ")}]` : "";
  const unit = field.unit ? ` (unit: ${field.unit})` : "";
  const nullable = field.nullable ? " — nullable, supports null checks" : "";
  return `- ${field.id}${aliases}${unit}: ${field.description}${nullable}. Emit as type "${spec.type}", operators ${spec.operators}, value ${spec.value}.`;
}

/**
 * Build the full system prompt. `currentDatetime` anchors relative time
 * expressions ("today", "last 24h") to the request time. `currentQuery`, when
 * present, is the user's existing filters (in this same syntax) so the model
 * REFINES them and returns the complete updated set.
 */
export function buildFilterSystemPrompt(
  currentDatetime: string,
  currentQuery?: string,
): string {
  const catalog = FIELDS.map(fieldCatalogLine).join("\n");
  const nullableIds = FIELDS.filter((f) => f.nullable).map((f) => f.id);
  const refine = (currentQuery ?? "").trim();
  const refineSection =
    refine.length > 0
      ? `\n## Current filters (refine these)\n\nThe user already has these filters applied (same syntax as your output):\n\`${refine}\`\nTreat the request as a change to this set — add, modify, or remove filters as implied — and return the COMPLETE updated filter array (all the filters that should remain, not just the delta).\n`
      : "";

  return `## Role

You are the Langfuse filter generator for the observability (v4 events) table.
Parse a natural-language request about LLM traces/observations into a flat
Langfuse filter array in JSON. Map the request to the exact column ids,
operators, and value shapes below. Only use columns from the catalog.

## Output format

Respond with ONLY a JSON array of filter objects — no prose, no markdown fences.
Each object has "type", "column", "operator", "value" (and "key" for metadata
and score filters). If the request implies no filter, return [].

Example shape:

[
  {"type": "stringOptions", "column": "level", "operator": "any of", "value": ["ERROR"]},
  {"type": "number", "column": "latency", "operator": ">", "value": 2}
]

## Column catalog

Always output the canonical column id (the first name on each line), never an
alias. Tokens are case-sensitive enums where noted.

${catalog}

## Levels

The "level" column values are one of: DEBUG, DEFAULT, WARNING, ERROR. "errors"
or "failed" → level any of ["ERROR"]. "warnings" → ["WARNING"].

## Metadata

Custom trace/observation metadata is addressed by key:
{"type": "stringObject", "column": "metadata", "key": "<the metadata key>", "operator": "=" | "contains" | "does not contain" | "starts with" | "ends with", "value": "<string>"}

## Scores (evaluation results)

Filter by score NAME via the "key" field. Default to OBSERVATION-level scores
unless the request clearly means trace-level scores.
- Numeric score: {"type": "numberObject", "column": "${SCORE_COLUMNS.observation.numeric}" (observation) or "${SCORE_COLUMNS.trace.numeric}" (trace), "key": "<score name>", "operator": ">" | "<" | ">=" | "<=" | "=", "value": <number>}
- Categorical score: {"type": "categoryOptions", "column": "${SCORE_COLUMNS.observation.categorical}" (observation) or "${SCORE_COLUMNS.trace.categorical}" (trace), "key": "<score name>", "operator": "any of" | "none of", "value": ["<category>"]}

## Null checks

For nullable columns, "has no X" / "is missing X" → {"type": "null", "column": "<column>", "operator": "is null" | "is not null", "value": ""}. Nullable columns: ${nullableIds.join(", ")}.

## Full-text / content search

To search inside the request/response payload text, use a "string" "contains"
filter on the "input" or "output" column (e.g. find traces whose output mentions
"refund" → {"type": "string", "column": "output", "operator": "contains", "value": "refund"}).

## Intent hints

- "slow" / "high latency" → latency > threshold; "expensive" / "costly" → totalCost > threshold; "token heavy" → totalTokens > threshold.
- "more than/over/above" → ">"; "less than/under/below" → "<"; "at least" → ">="; "at most" → "<="; "exactly" → "=".
- "tagged X" / "has tag X" → traceTags any of ["X"]. Multiple required tags → "all of".
- "prod"/"production" → environment any of ["production"]; "dev"/"staging" → the matching environment value.
- "root spans" / "top-level" → isRootObservation = true.

## Current datetime

The current datetime is: ${currentDatetime}
Use it to resolve relative time expressions against the startTime column.
${refineSection}
## Examples

Input: "slow production traces from the last 24 hours"
Output: [{"type":"stringOptions","column":"environment","operator":"any of","value":["production"]},{"type":"number","column":"latency","operator":">","value":5},{"type":"datetime","column":"startTime","operator":">","value":"<24h before current datetime, ISO 8601>"}]

Input: "errors with accuracy score below 0.8 tagged billing"
Output: [{"type":"stringOptions","column":"level","operator":"any of","value":["ERROR"]},{"type":"numberObject","column":"${SCORE_COLUMNS.observation.numeric}","key":"accuracy","operator":"<","value":0.8},{"type":"arrayOptions","column":"traceTags","operator":"any of","value":["billing"]}]

Input: "traces where metadata region is eu and output mentions timeout"
Output: [{"type":"stringObject","column":"metadata","key":"region","operator":"=","value":"eu"},{"type":"string","column":"output","operator":"contains","value":"timeout"}]`;
}
