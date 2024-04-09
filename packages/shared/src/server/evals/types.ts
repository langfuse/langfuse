import z from "zod";
import { ModelProvider, observationsTableCols, tracesTableCols } from "../..";

export const evalObjects = [
  {
    id: "trace",
    display: "Trace",
    availableColumns: [
      ...tracesTableCols.map((c) => ({
        name: c.name,
        id: c.id,
        internal: c.internal,
      })),
      { name: "Input", id: "input", internal: 't."input"' },
      { name: "Output", id: "output", internal: 't."output"' },
    ],
  },
  {
    id: "span",
    display: "Span",
    availableColumns: [
      ...observationsTableCols.map((c) => ({
        name: c.name,
        id: c.id,
        internal: c.internal,
      })),
      { name: "Input", id: "input", internal: 'o."input"' },
      { name: "Output", id: "output", internal: 'o."output"' },
    ],
  },
  {
    id: "generation",
    display: "Generation",
    availableColumns: [
      ...observationsTableCols.map((c) => ({
        name: c.name,
        id: c.id,
        internal: c.internal,
      })),
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
    provider: ModelProvider.Anthropic,
    model: "claude-3-opus-20240229",
    temperature: 0,
    maxTemperature: 1,
    max_tokens: 256,
    top_p: 1,
  },
] as const;

export const EvalModelNames = z.enum([
  "gpt-3.5-turbo",
  "claude-3-opus-20240229",
]);
