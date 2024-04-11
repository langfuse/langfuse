import z from "zod";
import { ModelProvider, observationsTableCols, tracesTableCols } from "../..";

export const evalObjects = [
  {
    id: "trace",
    display: "Trace",
    availableColumns: [
      {
        name: "Metadata",
        id: "metadata",
        type: "stringObject",
        internal: 'o."metadata"',
      },
      { name: "Input", id: "input", internal: 't."input"' },
      { name: "Output", id: "output", internal: 't."output"' },
    ],
  },
  {
    id: "span",
    display: "Span",
    availableColumns: [
      {
        name: "Metadata",
        id: "metadata",
        type: "stringObject",
        internal: 'o."metadata"',
      },
      { name: "Input", id: "input", internal: 'o."input"' },
      { name: "Output", id: "output", internal: 'o."output"' },
    ],
  },
  {
    id: "generation",
    display: "Generation",
    availableColumns: [
      {
        name: "Metadata",
        id: "metadata",
        type: "stringObject",
        internal: 'o."metadata"',
      },
      { name: "Input", id: "input", internal: 'o."input"' },
      { name: "Output", id: "output", internal: 'o."output"' },
    ],
  },
  { id: "event", display: "Event", availableColumns: observationsTableCols },
];

export const evalModels = [
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
