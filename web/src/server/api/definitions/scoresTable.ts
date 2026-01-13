import {
  type ColumnDefinition,
  formatColumnOptions,
  type SingleValueOption,
  ScoreSourceArray,
  ScoreDataTypeArray,
} from "@langfuse/shared";

export const scoresTableCols: ColumnDefinition[] = [
  {
    name: "Trace ID",
    id: "traceId",
    type: "string",
    internal: 's."trace_id"',
  },
  {
    name: "Session ID",
    id: "sessionId",
    type: "string",
    internal: 's."session_id"',
  },
  {
    name: "Trace Name",
    id: "traceName",
    type: "stringOptions",
    internal: 't."name"',
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Environment",
    id: "environment",
    type: "stringOptions",
    internal: 's."environment"',
    options: [], // to be added at runtime
  },
  {
    name: "Observation ID",
    id: "observationId",
    type: "string",
    internal: 's."observation_id"',
  },
  {
    name: "Timestamp",
    id: "timestamp",
    type: "datetime",
    internal: 's."timestamp"',
  },
  {
    name: "Source",
    id: "source",
    type: "stringOptions",
    internal: 's."source"::text',
    options: ScoreSourceArray.map((value) => ({ value })),
  },
  {
    name: "Data Type",
    id: "dataType",
    type: "stringOptions",
    internal: 's."data_type"::text',
    options: ScoreDataTypeArray.map((value) => ({ value })),
  },
  {
    name: "Name",
    id: "name",
    type: "stringOptions",
    internal: 's."name"',
    options: [], // to be added at runtime
  },
  { name: "Value", id: "value", type: "number", internal: 's."value"' },
  {
    name: "String Value",
    id: "stringValue",
    type: "stringOptions",
    internal: 's."string_value"',
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "User ID",
    id: "userId",
    type: "stringOptions",
    internal: 't."user_id"',
    options: [], // to be added at runtime
    nullable: true,
  },
  {
    name: "Trace Tags",
    id: "tags",
    type: "arrayOptions",
    internal: 't."tags"',
    options: [], // to be added at runtime
    nullable: true,
  },
];

export type ScoreOptions = {
  name: Array<SingleValueOption>;
  tags: Array<SingleValueOption>;
  traceName: Array<SingleValueOption>;
  userId: Array<SingleValueOption>;
  stringValue: Array<SingleValueOption>;
};

export function scoresTableColsWithOptions(
  options?: ScoreOptions,
): ColumnDefinition[] {
  return scoresTableCols.map((col) => {
    if (col.id === "name") {
      return formatColumnOptions(col, options?.name ?? []);
    }
    if (col.id === "tags") {
      return formatColumnOptions(col, options?.tags ?? []);
    }
    if (col.id === "traceName") {
      return formatColumnOptions(col, options?.traceName ?? []);
    }
    if (col.id === "userId") {
      return formatColumnOptions(col, options?.userId ?? []);
    }
    if (col.id === "stringValue") {
      return formatColumnOptions(col, options?.stringValue ?? []);
    }
    return col;
  });
}
