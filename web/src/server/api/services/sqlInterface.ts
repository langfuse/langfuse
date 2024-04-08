import { singleFilter } from "@langfuse/shared";
import { z } from "zod";

export const temporalUnit = z.enum([
  "year",
  "month",
  "week",
  "day",
  "hour",
  "minute",
]);

export const aggregations = z
  .enum([
    "SUM",
    "AVG",
    "COUNT",
    "MAX",
    "MIN",
    "50thPercentile",
    "75thPercentile",
    "90thPercentile",
    "95thPercentile",
    "99thPercentile",
  ])
  .optional();

export const groupByInterface = z.array(
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("datetime"),
      column: z.string(),
      temporalUnit: temporalUnit,
    }),
    z.object({ type: z.literal("number"), column: z.string() }),
    z.object({ type: z.literal("string"), column: z.string() }),
  ]),
);

const orderByInterface = z.array(
  z.object({
    column: z.string(),
    direction: z.enum(["ASC", "DESC"]),
    agg: aggregations,
  }),
);

export const filterInterface = z.array(singleFilter);

export const sqlInterface = z.object({
  from: z.enum([
    "traces",
    "traces_observations",
    "observations",
    "traces_scores",
    "traces_parent_observation_scores",
    "traces_observationsview",
    "traces_metrics",
  ]),
  filter: filterInterface.optional(),
  groupBy: groupByInterface.optional(),
  select: z.array(
    z.object({
      column: z.string(),
      agg: aggregations,
    }),
  ),
  orderBy: orderByInterface.optional(),
  limit: z.number().optional(),
});
