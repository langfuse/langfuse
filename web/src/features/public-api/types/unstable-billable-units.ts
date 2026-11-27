import { z } from "zod";
import { isoDateTime } from "@langfuse/shared";
import { USAGE_BREAKDOWN_MAX_RANGE_MS } from "@/src/features/organization-usage/constants/usageBreakdown";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Longest range with hourly buckets: 744 buckets per project. */
const BILLABLE_UNITS_MAX_HOURLY_RANGE_MS = 31 * DAY_MS;

export const GetBillableUnitsV1Query = z
  .object({
    fromTimestamp: isoDateTime({ offset: true }),
    toTimestamp: isoDateTime({ offset: true }),
    granularity: z.enum(["hour", "day", "week", "month"]).default("day"),
  })
  .refine(
    (query) =>
      new Date(query.fromTimestamp).getTime() <
      new Date(query.toTimestamp).getTime(),
    { message: "fromTimestamp must be before toTimestamp" },
  )
  .refine(
    (query) =>
      new Date(query.toTimestamp).getTime() -
        new Date(query.fromTimestamp).getTime() <=
      (query.granularity === "hour"
        ? BILLABLE_UNITS_MAX_HOURLY_RANGE_MS
        : USAGE_BREAKDOWN_MAX_RANGE_MS),
    {
      message:
        "The range must not exceed 31 days for hour granularity, or 366 days otherwise",
    },
  );

const BillableUnitsV1Row = z
  .object({
    bucket: z.string(),
    projectId: z.string(),
    count: z.number().int(),
    traces: z.number().int(),
    observations: z.number().int(),
    scores: z.number().int(),
    topicFacetSummaries: z.number().int(),
  })
  .strict();

export const GetBillableUnitsV1Response = z
  .object({
    data: z.array(BillableUnitsV1Row),
    usageRecordedFrom: z.string().nullable(),
  })
  .strict();
