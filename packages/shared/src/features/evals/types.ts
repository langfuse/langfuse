import z from "zod";
import { ModelProvider } from "../..";

export const langfuseObjects = [
  "trace",
  "span",
  "generation",
  "event",
] as const;

// variable mapping stored in the db for eval templates
export const variableMapping = z
  .object({
    templateVariable: z.string(), // variable name in the template
    // name of the observation to extract the variable from
    // not required for trace, as we only have one.
    objectName: z.string().nullish(),
    langfuseObject: z.enum(langfuseObjects),
    selectedColumnId: z.string(),
  })
  .refine(
    (value) => value.langfuseObject === "trace" || value.objectName !== null,
    {
      message: "objectName is required for langfuseObjects other than trace",
    }
  );

export const variableMappingList = z.array(variableMapping);

export const wipVariableMapping = z.object({
  templateVariable: z.string(),
  objectName: z.string().nullish(),
  langfuseObject: z.enum(langfuseObjects),
  selectedColumnId: z.string().nullish(),
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

export const availableEvalVariables = [
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

export const evalLLMModels = [
  {
    provider: ModelProvider.OpenAI,
    model: "gpt-3.5-turbo",
    temperature: 1,
    maxTemperature: 2,
    max_tokens: 256,
    top_p: 1,
  },
  {
    provider: ModelProvider.OpenAI,
    model: "gpt-4-turbo-preview",
    temperature: 1,
    maxTemperature: 2,
    max_tokens: 256,
    top_p: 1,
  },
] as const;

export const EvalModelNames = z.enum(["gpt-3.5-turbo", "gpt-4-turbo-preview"]);

export const OutputSchema = z.object({
  reasoning: z.string(),
  score: z.string(),
});

export enum EvalTargetObject {
  Trace = "trace",
}

export const DEFAULT_TRACE_JOB_DELAY = 10_000;
