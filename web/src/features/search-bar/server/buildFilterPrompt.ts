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
  dataContext?: string,
): string {
  const catalog = FIELDS.map(fieldCatalogLine).join("\n");
  const nullableIds = FIELDS.filter((f) => f.nullable).map((f) => f.id);
  const refine = (currentQuery ?? "").trim();
  const data = (dataContext ?? "").trim();
  const dataSection =
    data.length > 0
      ? `\n## Observed project data\n\nMap the request to the columns, values, and metadata keys that ACTUALLY appear below — prefer an observed value/metadata key over guessing a column. If a phrase matches a metadata key, use \`metadata.<key>\`. Do not invent values that aren't here unless the user gave a literal one.\n\n${data}\n`
      : "";
  const refineSection =
    refine.length > 0
      ? `\n## Current filters (refine these)\n\nThe user already has these filters applied (same syntax as your output):\n\`${refine}\`\nTreat the request as a change to this set — add, modify, or remove filters as implied — and return the COMPLETE updated filter array (all the filters that should remain, not just the delta).\n`
      : "";

  return `## Role

You are the Langfuse filter generator for the observability (v4 events) table.
Turn a natural-language request about LLM traces/observations into a flat
Langfuse filter array in JSON, using the FULL filter surface — not just simple
column matches. You can filter on:
- catalog columns (below) with their operators,
- custom **metadata** by key — BE WILLING to reach into metadata; many
  domain-specific attributes (queue, tenant, customer tier, feature flag, region,
  step, …) live in metadata, not in a top-level column,
- evaluation **scores** by name (numeric comparisons or categorical values),
- **content search**: substring match on the input / output payload,
- **null checks** (has / missing), tag groups (any / all / none of), and
  **negation / exclusion**.

Prefer values, metadata keys, and score names that appear in the observed
project data below (when provided) over inventing your own. Use real catalog
columns for standard fields; for anything custom or domain-specific, use
\`metadata.<key>\`. Don't fall back to a vague column guess when metadata or
content search expresses the intent better.

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

## Metadata (use it boldly)

Custom trace/observation metadata is addressed by key:
{"type": "stringObject", "column": "metadata", "key": "<the metadata key>", "operator": "=" | "contains" | "does not contain" | "starts with" | "ends with", "value": "<string>"}

If the request names a domain-specific attribute that is NOT a catalog column
(e.g. "routing queue", "tenant", "customer tier", "feature flag", "experiment
step"), filter on metadata: \`{"type":"stringObject","column":"metadata","key":"<key>",...}\`.
When the observed project data lists a metadata key that matches the user's
phrase (e.g. "routing queue" → metadata.routing.queue), use that exact key. Use
"contains" when the user gives a fuzzy/partial value, "=" for an exact value.

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
"mentions / talks about / says / contains X" in a trace → input and/or output
contains X.

## Negation & exclusion

- "not X" / "exclude X" / "except X" on an enum column (level, environment, type,
  traceTags, …) → operator "none of": {"type":"stringOptions"|"arrayOptions","column":...,"operator":"none of","value":[...]}.
- "does not contain Y" on text / metadata / input / output → "does not contain".
- "without X" / "missing X" / "no X" on a nullable column → null "is null"; "has X"
  / "with an X" → null "is not null".
- Negated numbers use the inverse comparison ("not slower than 2s" → latency <= 2).

## Tag groups

traceTags is an array. "tagged a or b" → any of [a, b]; "tagged BOTH a and b" →
"all of" [a, b]; "not tagged a" → "none of" [a].

## Intent hints

- "slow" / "high latency" → latency > threshold; "expensive" / "costly" → totalCost > threshold; "token heavy" → totalTokens > threshold.
- "more than/over/above" → ">"; "less than/under/below" → "<"; "at least" → ">="; "at most" → "<="; "exactly" → "=".
- "tagged X" / "has tag X" → traceTags any of ["X"]. Multiple required tags → "all of".
- "prod"/"production" → environment any of ["production"]; "dev"/"staging" → the matching environment value.
- "root spans" / "top-level" → isRootObservation = true.
- "named X" / "called X" → the name or traceName column (NOT environment).

## Current datetime

The current datetime is: ${currentDatetime}
Use it to resolve relative time expressions against the startTime column.
${refineSection}${dataSection}
## Examples

These span the full surface — comparisons, scores, metadata, content search,
null checks, tag groups, and negation. Match the user's intent to the closest
capability; don't reduce everything to a name/type guess.

Input: "slow production traces from the last 24 hours"
Output: [{"type":"stringOptions","column":"environment","operator":"any of","value":["production"]},{"type":"number","column":"latency","operator":">","value":5},{"type":"datetime","column":"startTime","operator":">","value":"<24h before current datetime, ISO 8601>"}]

Input: "errors with accuracy score below 0.8 tagged billing"
Output: [{"type":"stringOptions","column":"level","operator":"any of","value":["ERROR"]},{"type":"numberObject","column":"${SCORE_COLUMNS.observation.numeric}","key":"accuracy","operator":"<","value":0.8},{"type":"arrayOptions","column":"traceTags","operator":"any of","value":["billing"]}]

Input: "requests for the membership-support routing queue"
Output: [{"type":"stringObject","column":"metadata","key":"routing.queue","operator":"=","value":"membership-support"}]

Input: "where the output talks about a refund and the input mentions cancel"
Output: [{"type":"string","column":"output","operator":"contains","value":"refund"},{"type":"string","column":"input","operator":"contains","value":"cancel"}]

Input: "traces with negative sentiment"
Output: [{"type":"categoryOptions","column":"${SCORE_COLUMNS.observation.categorical}","key":"sentiment","operator":"any of","value":["negative"]}]

Input: "unfinished spans that have no end time"
Output: [{"type":"null","column":"endTime","operator":"is null","value":""}]

Input: "tagged both urgent and billing, not in dev"
Output: [{"type":"arrayOptions","column":"traceTags","operator":"all of","value":["urgent","billing"]},{"type":"stringOptions","column":"environment","operator":"none of","value":["dev"]}]

Input: "gpt-4 generations costing more than $0.50 that aren't errors"
Output: [{"type":"stringOptions","column":"providedModelName","operator":"any of","value":["gpt-4"]},{"type":"stringOptions","column":"type","operator":"any of","value":["GENERATION"]},{"type":"number","column":"totalCost","operator":">","value":0.5},{"type":"stringOptions","column":"level","operator":"none of","value":["ERROR"]}]`;
}
