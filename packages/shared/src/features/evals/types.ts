import z from "zod/v4";

export const langfuseObjects = [
  "trace",
  "span",
  "generation",
  "event",
  "dataset_item",
] as const;

const langfuseObject = z.enum(langfuseObjects);
export type LangfuseEvaluationObject = z.infer<typeof langfuseObject>;

// variable mapping stored in the db for eval templates
export const variableMapping = z
  .object({
    templateVariable: z.string(), // variable name in the template
    // name of the observation to extract the variable from
    // not required for trace, as we only have one.
    objectName: z.string().nullish(),
    langfuseObject: langfuseObject,
    selectedColumnId: z.string(),
    jsonSelector: z.string().nullish(),
  })
  .refine(
    (value) => value.langfuseObject === "trace" || value.objectName !== null,
    {
      message: "objectName is required for langfuseObjects other than trace",
    },
  );

export const variableMappingList = z.array(variableMapping);

export const wipVariableMapping = z.object({
  templateVariable: z.string(),
  objectName: z.string().nullish(),
  langfuseObject: langfuseObject,
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
  {
    id: "span",
    display: "Span",
    availableColumns: observationCols,
  },
  {
    id: "generation",
    display: "Generation",
    availableColumns: observationCols,
  },
  {
    id: "event",
    display: "Event",
    availableColumns: observationCols,
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

export const OutputSchema = z.object({
  reasoning: z.string(),
  score: z.string(),
});

export const DEFAULT_TRACE_JOB_DELAY = 10_000;

export const JobTimeScopeZod = z.enum(["NEW", "EXISTING"]);
export type JobTimeScope = z.infer<typeof JobTimeScopeZod>;

export const TimeScopeSchema = z.array(JobTimeScopeZod).default(["NEW"]);
