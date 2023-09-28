import { prisma } from "@/src/server/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const singleFilter = z.object({
  field: z.string(),
  operator: z.enum(["=", ">", "<", ">=", "<=", "in", "like"]),
  value: z.any(),
});

export const executeQuery = async (query: string) => {
  return await prisma.$queryRawUnsafe(query);
};

const sqlInterface = z.object({
  from: z.enum([
    "traces",
    "traces_observations",
    "observations",
    "traces_observations_scores",
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
        name: z.string(),
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
      z.object({ type: z.literal("number"), name: z.string() }),
      z.object({ type: z.literal("string"), name: z.string() }),
    ]),
  ),
  select: z.array(
    z.object({ field: z.string(), agg: z.enum(["SUM", "AVG"]).nullable() }),
  ),
});

export const createQuery = (query: z.TypeOf<typeof sqlInterface>) => {
  const selectFields = query.select.map((field) =>
    field.agg
      ? `${field.agg}(${field.field}) as ${field.field}`
      : `${field.field}`,
  );
  const selectString = `SELECT ${selectFields.join(", ")}`;

  const fromString = ` FROM ${query.from}`;

  let groupString = "";
  if (query.groupBy.length > 0) {
    const groupByFields = query.groupBy.map((groupBy) => {
      if (groupBy.type === "datetime") {
        return `DATE_TRUNC('${groupBy.temporalUnit}', ${groupBy.name})`;
      } else {
        return groupBy.name;
      }
    });
    groupString = ` GROUP BY ${groupByFields.join(", ")}`;
  }

  return `${selectString}${fromString}${groupString};`;
};

const traces = Prisma.sql`from traces as t`;
const traces_observations = Prisma.sql`from traces t LEFT JOIN observations o ON t.id = o.trace_id`;
