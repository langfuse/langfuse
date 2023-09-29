import { prisma } from "@/src/server/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";

type Column = {
  name: string;
  type: string;
  internal: string;
};

const comlpetionTokens = {
  name: "completionTokens",
  type: "number",
  internal: '"o"."completion_tokens"',
};
const observationId = {
  name: "observationId",
  type: "string",
  internal: '"o"."project_id"',
};
const observationName = {
  name: "name",
  type: "string",
  internal: '"o"."name"',
};

const traceId = { name: "traceId", type: "string", internal: '"t"."id"' };

const tableDefinitions = {
  traces: {
    columns: [
      { name: "id", type: "string", internal: '"t"."id"' },
      { name: "projectId", type: "string", internal: '"t"."project_id"' },
    ],
  },
  traces_observations: {
    columns: [
      traceId,
      observationId,
      { name: "type", type: "string", internal: '"o"."type"' },
      { name: "projectId", type: "string", internal: '"t"."project_id"' },
    ],
  },
  observations: {
    columns: [
      traceId,
      observationName,
      { name: "type", type: "string", internal: '"o"."type"' },
      comlpetionTokens,
      observationId,
      { name: "projectId", type: "string", internal: '"o"."project_id"' },
    ],
  },
};

const singleFilter = z.object({
  column: z.string(),
  operator: z.enum(["=", ">", "<", ">=", "<=", "in", "like"]),
  value: z.any(),
});

export const executeQuery = async <T>(query: string) => {
  return await prisma.$queryRawUnsafe<T>(query);
};

const sqlInterface = z.object({
  from: z.enum([
    "traces",
    "traces_observations",
    "observations",
    "traces_scores",
  ]), // predefined views on our db
  filter: z.array(
    z.object({
      operator: z.enum(["AND", "OR"]),
      filters: z.array(singleFilter),
    }),
  ),
  groupBy: z.array(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("datetime"),
        column: z.string(),
        temporalUnit: z.enum([
          "year",
          "month",
          "day",
          "hour",
          "minute",
          "second",
          "millisecond",
          "microsecond",
          "nanosecond",
        ]),
      }),
      z.object({ type: z.literal("number"), column: z.string() }),
      z.object({ type: z.literal("string"), column: z.string() }),
    ]),
  ),
  select: z.array(
    z.object({ column: z.string(), agg: z.enum(["SUM", "AVG"]).nullable() }),
  ),
});

export const createQuery = (query: z.TypeOf<typeof sqlInterface>) => {
  const selectFields = query.select.map((field) =>
    field.agg
      ? `${field.agg}(${field.column}) as ${field.column}`
      : `${field.column}`,
  );
  const selectString = `SELECT ${selectFields.join(", ")}`;

  const fromString = ` FROM ${getTableSql(query.from)}`;

  let groupString = "";
  if (query.groupBy.length > 0) {
    const groupByFields = query.groupBy.map((groupBy) => {
      if (groupBy.type === "datetime") {
        return `DATE_TRUNC('${groupBy.temporalUnit}', ${groupBy.column})`;
      } else {
        return groupBy.column;
      }
    });
    groupString = ` GROUP BY ${groupByFields.join(", ")}`;
  }

  return `${selectString}${fromString}${groupString};`;
};

const getTableSql = (table: z.infer<typeof sqlInterface>["from"]): string => {
  const tables = {
    traces: ` traces as t`,
    observations: ` observations as o`,
    traces_observations: ` traces t LEFT JOIN observations o ON t.id = o.trace_id`,
    traces_scores: ` traces t JOIN scores s ON t.id = s.trace_id`,
  };

  return tables[table];
};

const getColumnSql = (
  table: z.infer<typeof sqlInterface>["from"],
  column: Column,
): string => {
  const tables = {
    traces: ` FROM traces as t`,
    observations: ` FROM observations as o`,
    traces_observations: ` FROM traces t LEFT JOIN observations o ON t.id = o.trace_id`,
    traces_scores: ` FROM traces t JOIN scores s ON t.id = s.trace_id`,
  };

  return tables[table];
};
