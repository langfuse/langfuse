import {
  type ColumnDefinition,
  formatColumnOptions,
  type SingleValueOption,
  ScoreSourceArray,
  ScoreDataTypeArray,
} from "@langfuse/shared";
import { isOceanBase } from "@/src/utils/oceanbase";

function scoresTableColsDef(): ColumnDefinition[] {
  const ob = isOceanBase();
  return [
    {
      name: "Trace ID",
      id: "traceId",
      type: "string",
      internal: ob ? "s.trace_id" : 's."trace_id"',
    },
    {
      name: "Session ID",
      id: "sessionId",
      type: "string",
      internal: ob ? "s.session_id" : 's."session_id"',
    },
    {
      name: "Trace Name",
      id: "traceName",
      type: "stringOptions",
      internal: ob ? "t.name" : 't."name"',
      options: [], // to be added at runtime
      nullable: true,
    },
    {
      name: "Environment",
      id: "environment",
      type: "stringOptions",
      internal: ob ? "s.environment" : 's."environment"',
      options: [], // to be added at runtime
    },
    {
      name: "Observation ID",
      id: "observationId",
      type: "string",
      internal: ob ? "s.observation_id" : 's."observation_id"',
    },
    {
      name: "Timestamp",
      id: "timestamp",
      type: "datetime",
      internal: ob ? "s.timestamp" : 's."timestamp"',
    },
    {
      name: "Source",
      id: "source",
      type: "stringOptions",
      internal: ob ? "s.source" : 's."source"::text',
      options: ScoreSourceArray.map((value) => ({ value })),
    },
    {
      name: "Data Type",
      id: "dataType",
      type: "stringOptions",
      internal: ob ? "s.data_type" : 's."data_type"::text',
      options: ScoreDataTypeArray.map((value) => ({ value })),
    },
    {
      name: "Name",
      id: "name",
      type: "stringOptions",
      internal: ob ? "s.name" : 's."name"',
      options: [], // to be added at runtime
    },
    {
      name: "Value",
      id: "value",
      type: "number",
      internal: ob ? "s.value" : 's."value"',
    },
    {
      name: "String Value",
      id: "stringValue",
      type: "stringOptions",
      internal: ob ? "s.string_value" : 's."string_value"',
      options: [], // to be added at runtime
      nullable: true,
    },
    {
      name: "User ID",
      id: "userId",
      type: "stringOptions",
      internal: ob ? "t.user_id" : 't."user_id"',
      options: [], // to be added at runtime
      nullable: true,
    },
    {
      name: "Trace Tags",
      id: "tags",
      type: "arrayOptions",
      internal: ob ? "t.tags" : 't."tags"',
      options: [], // to be added at runtime
      nullable: true,
    },
  ];
}

export const scoresTableCols = scoresTableColsDef();

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
