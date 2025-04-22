import {
  type ColumnDefinition,
  ScoreSource,
  ScoreDataType,
  formatColumnOptions,
  type SingleValueOption,
} from "@langfuse/shared";

export const scoresTableCols: ColumnDefinition[] = [
  {
    name: "Trace ID",
    id: "traceId",
    type: "string",
    internal: 's."trace_id"',
  },
  {
    name: "Trace Name",
    id: "traceName",
    type: "string",
    internal: 't."name"',
    nullable: true,
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
    options: Object.values(ScoreSource).map((value) => ({ value })),
  },
  {
    name: "Data Type",
    id: "dataType",
    type: "stringOptions",
    internal: 's."data_type"::text',
    options: Object.values(ScoreDataType).map((value) => ({ value })),
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
    name: "User ID",
    id: "userId",
    type: "string",
    internal: 't."user_id"',
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
    return col;
  });
}
