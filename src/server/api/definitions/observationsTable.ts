import {
  type OptionsDefinition,
  type ColumnDefinition,
} from "@/src/server/api/interfaces/tableDefinition";
import { ObservationLevel } from "@prisma/client";

// to be used server side
export const observationsTableCols: ColumnDefinition[] = [
  {
    name: "id",
    id: "id",
    type: "string",
    internal: 'o."id"',
  },
  {
    name: "name",
    id: "name",
    type: "stringOptions",
    internal: 'o."name"',
    options: [], // to be added at runtime
  },
  { name: "traceId", id: "traceId", type: "string", internal: 't."id"' },
  {
    name: "traceName",
    id: "traceName",
    type: "stringOptions",
    internal: 't."name"',
    options: [], // to be added at runtime
  },
  { name: "userId", id: "userId", type: "string", internal: 't."user_id"' },
  {
    name: "start_time",
    id: "startTime",
    type: "datetime",
    internal: 'o."start_time"',
  },
  {
    name: "end_time",
    id: "endTime",
    type: "datetime",
    internal: 'o."end_time"',
  },
  {
    name: "latency (s)",
    id: "latency",
    type: "number",
    internal: '"latency"',
  },
  {
    name: "Cost ($)",
    type: "number",
    internal: 'o."calculated_total_cost"',
  },
  {
    name: "level",
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
    name: "model",
    id: "model",
    type: "stringOptions",
    internal: 'o."model"',
    options: [], // to be added at runtime
  },
  {
    name: "metadata",
    id: "metadata",
    type: "stringObject",
    internal: 'o."metadata"',
  },
  {
    name: "scores_avg",
    id: "scores_avg",
    type: "numberObject",
    internal: "scores_avg",
  },
  {
    name: "version",
    id: "version",
    type: "string",
    internal: 'o."version"',
  },
];

// to be used client side, insert options for use in filter-builder
// allows for undefined options, to offer filters while options are still loading
export type ObservationOptions = {
  model: Array<OptionsDefinition>;
  name: Array<OptionsDefinition>;
  traceName: Array<OptionsDefinition>;
  scores_avg: Array<string>;
};

export function observationsTableColsWithOptions(
  options?: ObservationOptions,
): ColumnDefinition[] {
  return observationsTableCols.map((col) => {
    if (col.name === "model") {
      return { ...col, options: options?.model ?? [] };
    }
    if (col.name === "name") {
      return { ...col, options: options?.name ?? [] };
    }
    if (col.name === "traceName") {
      return { ...col, options: options?.traceName ?? [] };
    }
    if (col.name === "scores_avg") {
      return { ...col, keyOptions: options?.scores_avg ?? [] };
    }
    return col;
  });
}
