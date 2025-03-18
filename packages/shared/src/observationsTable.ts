import {
  type OptionsDefinition,
  type ColumnDefinition,
} from "./tableDefinitions";
import { ObservationLevelType } from "./server";

// to be used server side
export const observationsTableCols: ColumnDefinition[] = [
  {
    name: "ID",
    id: "id",
    type: "string",
    internal: 'o."id"',
  },
  {
    name: "Name",
    id: "name",
    type: "stringOptions",
    internal: 'o."name"',
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "type",
    id: "type",
    type: "stringOptions",
    options: [],
    internal: 'o."type"',
  },
  { name: "Trace ID", id: "traceId", type: "string", internal: 't."id"' },
  {
    name: "Trace Name",
    id: "traceName",
    type: "stringOptions",
    internal: 't."name"',
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "User ID",
    id: "userId",
    type: "string",
    internal: 't."user_id"',
    nullable: true,
  },
  {
    name: "Start Time",
    id: "startTime",
    type: "datetime",
    internal: 'o."start_time"',
  },
  {
    name: "End Time",
    id: "endTime",
    type: "datetime",
    internal: 'o."end_time"',
  },
  {
    name: "Time To First Token (s)",
    id: "timeToFirstToken",
    type: "number",
    internal:
      'EXTRACT(EPOCH FROM (o."completion_start_time" - o."start_time"))',
    nullable: true,
  },
  {
    name: "Latency (s)",
    id: "latency",
    type: "number",
    internal: '"latency"',
  },
  {
    name: "Tokens per second",
    id: "tokensPerSecond",
    type: "number",
    internal: 'o."completion_tokens" / "latency"',
    nullable: true,
  },
  {
    name: "Input Cost ($)",
    id: "inputCost",
    type: "number",
    internal: 'o."calculated_input_cost"',
    nullable: true,
  },
  {
    name: "Output Cost ($)",
    id: "outputCost",
    type: "number",
    internal: 'o."calculated_output_cost"',
    nullable: true,
  },
  {
    name: "Total Cost ($)",
    id: "totalCost",
    type: "number",
    internal: 'o."calculated_total_cost"',
    nullable: true,
  },
  {
    name: "Level",
    id: "level",
    type: "stringOptions",
    internal: 'o."level"::text',
    options: [
      { value: "DEBUG" },
      { value: "DEFAULT" },
      { value: "WARNING" },
      { value: "ERROR" },
    ] as { value: ObservationLevelType }[],
  },
  {
    name: "Status Message",
    id: "statusMessage",
    type: "string",
    internal: 'o."status_message"',
    nullable: true,
  },
  {
    name: "Model",
    id: "model",
    type: "stringOptions",
    internal: 'o."model"',
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Model ID",
    id: "modelId",
    type: "stringOptions",
    internal: 'o."internal_model_id"',
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Input Tokens",
    id: "inputTokens",
    type: "number",
    internal: 'o."prompt_tokens"',
    nullable: true,
  },
  {
    name: "Output Tokens",
    id: "outputTokens",
    type: "number",
    internal: 'o."completion_tokens"',
    nullable: true,
  },
  {
    name: "Total Tokens",
    id: "totalTokens",
    type: "number",
    internal: 'o."total_tokens"',
    nullable: true,
  },
  {
    name: "Usage",
    id: "usage",
    type: "number",
    internal: 'o."total_tokens"',
  },
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: 'o."metadata"',
  },
  {
    name: "Scores",
    id: "scores_avg",
    type: "numberObject",
    internal: "scores_avg",
  },
  {
    name: "Version",
    id: "version",
    type: "string",
    internal: 'o."version"',
    nullable: true,
  },
  {
    name: "Prompt Name",
    id: "promptName",
    type: "stringOptions",
    internal: "p.name",
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Prompt Version",
    id: "promptVersion",
    type: "number",
    internal: "p.version",
    nullable: true,
  },
  {
    name: "Trace Tags",
    id: "tags",
    type: "arrayOptions",
    internal: "t.tags",
    options: [], // to be added at runtime
  },
];

// to be used client side, insert options for use in filter-builder
// allows for undefined options, to offer filters while options are still loading
export type ObservationOptions = {
  model: Array<OptionsDefinition>;
  modelId: Array<OptionsDefinition>;
  name: Array<OptionsDefinition>;
  traceName: Array<OptionsDefinition>;
  scores_avg: Array<string>;
  promptName: Array<OptionsDefinition>;
  tags: Array<OptionsDefinition>;
  type: Array<OptionsDefinition>;
};

export function observationsTableColsWithOptions(
  options?: ObservationOptions,
): ColumnDefinition[] {
  return observationsTableCols.map((col) => {
    if (col.id === "model") {
      return { ...col, options: options?.model ?? [] };
    }
    if (col.id === "modelId") {
      return { ...col, options: options?.modelId ?? [] };
    }
    if (col.id === "name") {
      return { ...col, options: options?.name ?? [] };
    }
    if (col.id === "traceName") {
      return { ...col, options: options?.traceName ?? [] };
    }
    if (col.id === "scores_avg") {
      return { ...col, keyOptions: options?.scores_avg ?? [] };
    }
    if (col.id === "promptName") {
      return { ...col, options: options?.promptName ?? [] };
    }
    if (col.id === "tags") {
      return { ...col, options: options?.tags ?? [] };
    }
    if (col.id === "type") {
      return { ...col, options: options?.type ?? [] };
    }
    return col;
  });
}
