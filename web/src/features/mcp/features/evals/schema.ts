import { z } from "zod";
import {
  ExperimentEvaluationRuleMapping,
  PublicCategoricalEvaluatorOutputScoreDefinition,
  PublicEvaluatorModelConfig,
  PublicEvaluatorOutputDefinition,
  PublicEvaluatorOutputFieldDefinition,
} from "@/src/features/public-api/types/unstable-public-evals-contract";

/**
 * Discovery-facing base schemas for the eval tools. The MCP layer rejects union
 * JSON schemas, so the contract's union schemas (`outputDefinition`, rule
 * `filter`) are flattened here; everything else reuses the contract directly.
 * Precise unions are enforced by each tool's `inputSchema`.
 */

// Derived from the contract union so a new variant can't silently drift out.
const evaluatorOutputDataTypes = PublicEvaluatorOutputDefinition.options.map(
  (option) => option.shape.dataType.value,
) as [string, ...string[]];

// Flattened from the contract's `dataType` union: the categorical score is the
// widest variant, with its categorical-only fields made optional.
export const EvaluatorOutputDefinitionBaseSchema = z
  .object({
    dataType: z.enum(evaluatorOutputDataTypes),
    reasoning: PublicEvaluatorOutputFieldDefinition,
    score: PublicCategoricalEvaluatorOutputScoreDefinition.partial({
      categories: true,
      shouldAllowMultipleMatches: true,
    }),
  })
  .describe(
    "Score output definition. Required when type is `llm_as_judge`; omit for `code` evaluators.",
  );

// Reused as-is; callers apply `.optional()` (never `.nullable()`, which is `anyOf`).
export const EvaluatorModelConfigBaseSchema =
  PublicEvaluatorModelConfig.describe(
    "Model used for `llm_as_judge` evaluation. Optional; falls back to the project default eval model.",
  );

// Experiment mapping has the widest `source` enum, so it covers both targets.
export const RuleMappingBaseSchema = ExperimentEvaluationRuleMapping.describe(
  "Maps an evaluator variable to a data source. `observation` rules use `input`, `output`, `metadata`; `experiment` rules also allow `expected_output` and `experiment_item_metadata`. Required for `llm_as_judge` evaluators; omit for `code` evaluators (Langfuse manages their mapping).",
);

// Loose stand-in for the contract's per-column filter union. `type` is required
// and object columns (e.g. `metadata`) take a `key` — mirrors the scores/metrics
// MCP filter shape, not the type-inferring listObservations one.
export const RuleFilterBaseSchema = z
  .object({
    column: z.string(),
    operator: z.string(),
    value: z.any(),
    type: z.string(),
    key: z.string().optional(),
  })
  .describe(
    'Filter condition, e.g. {"column":"version","operator":"=","value":"1.0.0","type":"string"}. ' +
      "Use `key` for object columns such as `metadata`. `observation` rules filter on trace/observation columns; `experiment` rules filter on `datasetId`.",
  );
