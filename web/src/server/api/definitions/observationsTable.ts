import {
  type OptionsDefinition,
  type ColumnDefinition,
} from "@/src/server/api/interfaces/tableDefinition";
import { ObservationLevel } from "@langfuse/shared";

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
  },
  { name: "Trace ID", id: "traceId", type: "string", internal: 't."id"' },
  {
    name: "Trace Name",
    id: "traceName",
    type: "stringOptions",
    internal: 't."name"',
    options: [], // to be added at runtime
  },
  { name: "User ID", id: "userId", type: "string", internal: 't."user_id"' },
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
    name: "Latency",
    id: "latency",
    type: "number",
    internal: '"latency"',
  },
  {
    name: "Total Cost",
    id: "totalCost",
    type: "number",
    internal: 'o."calculated_total_cost"',
  },
  {
    name: "Level",
    id: "level",
    type: "stringOptions",
    internal: 'o."level"::text',
    options: Object.values(ObservationLevel).map((value) => ({ value })),
  },
  {
    name: "Status Message",
    id: "statusMessage",
    type: "string",
    internal: 'o."status_message"',
  },
  {
    name: "Model",
    id: "model",
    type: "stringOptions",
    internal: 'o."model"',
    options: [], // to be added at runtime
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
  },
  {
    name: "Prompt Name",
    id: "promptName",
    type: "stringOptions",
    internal: "p.name",
    options: [], // to be added at runtime
  },
];

// to be used client side, insert options for use in filter-builder
// allows for undefined options, to offer filters while options are still loading
export type ObservationOptions = {
  model: Array<OptionsDefinition>;
  name: Array<OptionsDefinition>;
  traceName: Array<OptionsDefinition>;
  scores_avg: Array<string>;
  promptName: Array<OptionsDefinition>;
};

export const GENERATIONS_ID_NAME_MAP = {
  id: "ID",
  name: "Name",
  traceId: "Trace ID",
  traceName: "Trace Name",
  userId: "User ID",
  startTime: "Start Time",
  endTime: "End Time",
  latency: "Latency",
  totalCost: "Total Cost",
  level: "Level",
  statusMessage: "Status Message",
  model: "Model",
  metadata: "Metadata",
  scores_avg: "Scores",
  version: "Version",
  promptName: "Prompt Name",
};

export function observationsTableColsWithOptions(
  options?: ObservationOptions,
): ColumnDefinition[] {
  return observationsTableCols.map((col) => {
    if (col.id === "model") {
      return { ...col, options: options?.model ?? [] };
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
    return col;
  });
}
