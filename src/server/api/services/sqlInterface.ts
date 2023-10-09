import { singleFilter } from "@/src/server/api/interfaces/filters";
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
  .enum(["SUM", "AVG", "COUNT", "MAX", "MIN"])
  .nullable();

export const sqlInterface = z.object({
  from: z.enum([
    "traces",
    "traces_observations",
    "observations",
    "traces_scores",
    "traces_parent_observation_scores",
  ]),
  filter: z.array(singleFilter).optional().default([]),
  groupBy: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("datetime"),
          column: z.string(),
          temporalUnit: temporalUnit,
        }),
        z.object({ type: z.literal("number"), column: z.string() }),
        z.object({ type: z.literal("string"), column: z.string() }),
      ]),
    )
    .optional()
    .default([]),
  select: z.array(
    z.object({
      column: z.string(),
      agg: aggregations,
    }),
  ),
  orderBy: z
    .array(
      z.object({
        column: z.string(),
        direction: z.enum(["ASC", "DESC"]),
        agg: aggregations,
      }),
    )
    .optional()
    .default([]),
  limit: z.number().optional(),
});
