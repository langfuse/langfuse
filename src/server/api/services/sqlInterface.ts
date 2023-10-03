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

export const sqlInterface = z.object({
  from: z.enum([
    "traces",
    "traces_observations",
    "observations",
    "traces_scores",
    "traces_parent_observation_scores",
  ]),
  filter: z.array(singleFilter),
  groupBy: z.array(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("datetime"),
        column: z.string(),
        temporalUnit: temporalUnit,
      }),
      z.object({ type: z.literal("number"), column: z.string() }),
      z.object({ type: z.literal("string"), column: z.string() }),
    ]),
  ),
  select: z.array(
    z.object({
      column: z.string(),
      agg: z.enum(["SUM", "AVG", "COUNT"]).nullable(),
    }),
  ),
  orderBy: z.array(
    z.object({
      column: z.string(),
      direction: z.enum(["ASC", "DESC"]),
    }),
  ),
});
