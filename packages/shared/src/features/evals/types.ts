import z from "zod/v4";
import { ScoreDataTypeEnum } from "../../domain/scores";

export const EvalTargetObject = {
  TRACE: "trace",
  DATASET: "dataset",
  EVENT: "event",
  EXPERIMENT: "experiment",
} as const;

export type EvalTargetObject =
  (typeof EvalTargetObject)[keyof typeof EvalTargetObject];

export const EvalTargetObjectSchema = z.enum(Object.values(EvalTargetObject));

export const langfuseObjects = [
  "trace",
  "span",
  "generation",
  "event",
  "agent",
  "tool",
  "chain",
  "retriever",
  "evaluator",
  "embedding",
  "guardrail",
  "dataset_item",
] as const;

const langfuseObject = z.enum(langfuseObjects);
export type LangfuseEvaluationObject = z.infer<typeof langfuseObject>;

// variable mapping stored in the db for eval templates
export const variableMapping = z
  .object({
    templateVariable: z.string(), // variable name in the template
    // name of the observation to extract the variable from
    // not required for trace or dataset_item, as we only have one of each.
    objectName: z.string().nullish(),
    langfuseObject: langfuseObject,
    selectedColumnId: z.string(),
    jsonSelector: z.string().nullish(),
  })
  .refine(
    (value) =>
      value.langfuseObject === "trace" ||
      value.langfuseObject === "dataset_item" ||
      value.objectName !== null,
    {
      message:
        "objectName is required for observation objects (generation, span, score)",
    },
  );

export const variableMappingList = z.array(variableMapping);

// WIP version for forms - langfuseObject optional to support both:
// - Trace/Dataset evals: Include langfuseObject and objectName to specify which observation
// - Event/Experiment evals: Omit them since the observation is already selected
export const wipVariableMapping = z.object({
  templateVariable: z.string(),
  objectName: z.string().nullish(),
  langfuseObject: langfuseObject.optional(),
  selectedColumnId: z.string().nullish(),
  jsonSelector: z.string().nullish(),
});

const observationCols = [
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: 'o."metadata"',
  },
  { name: "Input", id: "input", internal: 'o."input"' },
  { name: "Output", id: "output", internal: 'o."output"' },
];

export const availableTraceEvalVariables = [
  {
    id: "agent",
    display: "Agent",
    availableColumns: observationCols,
  },
  {
    id: "chain",
    display: "Chain",
    availableColumns: observationCols,
  },
  {
    id: "embedding",
    display: "Embedding",
    availableColumns: observationCols,
  },
  {
    id: "evaluator",
    display: "Evaluator",
    availableColumns: observationCols,
  },
  {
    id: "event",
    display: "Event",
    availableColumns: observationCols,
  },
  {
    id: "generation",
    display: "Generation",
    availableColumns: observationCols,
  },
  {
    id: "guardrail",
    display: "Guardrail",
    availableColumns: observationCols,
  },
  {
    id: "retriever",
    display: "Retriever",
    availableColumns: observationCols,
  },
  {
    id: "span",
    display: "Span",
    availableColumns: observationCols,
  },
  {
    id: "tool",
    display: "Tool",
    availableColumns: observationCols,
  },
  {
    id: "trace",
    display: "Trace",
    availableColumns: [
      {
        name: "Metadata",
        id: "metadata",
        type: "stringObject",
        internal: 't."metadata"',
      },
      { name: "Input", id: "input", internal: 't."input"' },
      { name: "Output", id: "output", internal: 't."output"' },
    ],
  },
];

export const availableDatasetEvalVariables = [
  {
    id: "dataset_item",
    display: "Dataset item",
    availableColumns: [
      {
        name: "Metadata",
        id: "metadata",
        type: "stringObject",
        internal: 'd."metadata"',
      },
      { name: "Input", id: "input", internal: 'd."input"' },
      {
        name: "Expected output",
        id: "expected_output",
        internal: 'd."expected_output"',
      },
    ],
  },
  ...availableTraceEvalVariables,
];

export const EvalTemplateOutputKind = {
  NUMERIC: ScoreDataTypeEnum.NUMERIC,
  CATEGORICAL: ScoreDataTypeEnum.CATEGORICAL,
} as const;

export const EvalTemplateOutputKindSchema = z.enum(
  Object.values(EvalTemplateOutputKind),
);
export type EvalTemplateOutputKind =
  (typeof EvalTemplateOutputKind)[keyof typeof EvalTemplateOutputKind];

// Legacy evaluator templates stored score/reasoning prompts directly as strings.
// Keep this permissive so older rows can still be parsed and normalized.
const EvalTemplateLegacyOutputSchema = z.object({
  reasoning: z.string().default(""),
  score: z.string().default(""),
});

const EvalTemplateOutputFieldSchema = z.object({
  description: z.string().trim().min(1),
});

export const EvalTemplateCategoricalOptionSchema = z.object({
  value: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
});
export type EvalTemplateCategoricalOption = z.infer<
  typeof EvalTemplateCategoricalOptionSchema
>;

export const VersionedNumericEvalTemplateOutputSchema = z.object({
  version: z.literal(2),
  kind: z.literal(EvalTemplateOutputKind.NUMERIC),
  reasoning: EvalTemplateOutputFieldSchema,
  score: EvalTemplateOutputFieldSchema,
});

export const VersionedCategoricalEvalTemplateOutputSchema = z
  .object({
    version: z.literal(2),
    kind: z.literal(EvalTemplateOutputKind.CATEGORICAL),
    reasoning: EvalTemplateOutputFieldSchema,
    score: z.object({
      description: z.string().trim().min(1),
      options: z.array(EvalTemplateCategoricalOptionSchema).min(1),
    }),
  })
  .superRefine((value, ctx) => {
    const seenValues = new Set<string>();

    value.score.options.forEach((option, index) => {
      const normalizedValue = option.value.trim();
      if (seenValues.has(normalizedValue)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Category values must be unique",
          path: ["score", "options", index, "value"],
        });
        return;
      }

      seenValues.add(normalizedValue);
    });
  });

export const EvalTemplateOutputSchema = z.union([
  EvalTemplateLegacyOutputSchema,
  VersionedNumericEvalTemplateOutputSchema,
  VersionedCategoricalEvalTemplateOutputSchema,
]);
export type EvalTemplateOutputSchema = z.infer<typeof EvalTemplateOutputSchema>;

export const DEFAULT_TRACE_JOB_DELAY = 10_000;

export const JobTimeScopeZod = z.enum(["NEW", "EXISTING"]);
export type JobTimeScope = z.infer<typeof JobTimeScopeZod>;

export const TimeScopeSchema = z.array(JobTimeScopeZod).default(["NEW"]);

// Simplified variable mapping for observation-based evals.
// Unlike trace-based evals, we don't need objectName since we're directly
// targeting a specific observation - no need to specify which observation to extract from.
export const observationVariableMapping = z.object({
  templateVariable: z.string(), // variable name in the template
  selectedColumnId: z.string(), // column to extract (must match observationEvalVariableColumns.id)
  jsonSelector: z.string().nullish(), // optional JSON path selector
});

export const observationVariableMappingList = z.array(
  observationVariableMapping,
);
export type ObservationVariableMapping = z.infer<
  typeof observationVariableMapping
>;
