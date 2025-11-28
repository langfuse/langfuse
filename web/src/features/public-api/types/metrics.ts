import {
  InvalidRequestError,
  paginationMetaResponseZod,
  publicApiPaginationZod,
  singleFilter,
} from "@langfuse/shared";
import { stringDateTime } from "@langfuse/shared/src/server";
import { z } from "zod/v4";
import { dimension, granularities, metric, views } from "@/src/features/query";

/**
 * Query Object Structure
 */
export const MetricsQueryObject = z
  .object({
    // Pagination parameters
    // page: z.number().min(1).default(1),
    // limit: z.number().min(1).max(100).default(10),

    // QueryType structure
    view: views,
    dimensions: z.array(dimension).optional().default([]),
    metrics: z.array(metric),
    filters: z.array(singleFilter).optional().default([]),
    timeDimension: z
      .object({
        granularity: granularities,
      })
      .nullable()
      .optional()
      .default(null),
    fromTimestamp: z.string().datetime({ offset: true }),
    toTimestamp: z.string().datetime({ offset: true }),
    orderBy: z
      .array(
        z.object({
          field: z.string(),
          direction: z.enum(["asc", "desc"]),
        }),
      )
      .nullable()
      .optional()
      .default(null),
    config: z
      .object({
        bins: z.number().int().min(1).max(100).optional(),
        row_limit: z.number().int().positive().lte(1000).optional(),
      })
      .optional(),
  })
  .refine(
    (query) =>
      // Ensure fromTimestamp is before toTimestamp
      new Date(query.fromTimestamp).getTime() <
      new Date(query.toTimestamp).getTime(),
    {
      message: "fromTimestamp must be before toTimestamp",
    },
  );

/**
 * Endpoints
 */

// GET /api/public/metrics
export const GetMetricsV1Query = z.object({
  query: z
    .string()
    .transform((str) => {
      try {
        return JSON.parse(str);
      } catch (_e) {
        throw new InvalidRequestError("Invalid JSON in query parameter");
      }
    })
    .pipe(MetricsQueryObject),
});

export const GetMetricsV1Response = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
  // meta: paginationMetaResponseZod,
});

// Get /metrics/daily
export const GetMetricsDailyV1Query = z.object({
  ...publicApiPaginationZod,
  traceName: z.string().nullish(),
  userId: z.string().nullish(),
  tags: z.union([z.array(z.string()), z.string()]).nullish(),
  environment: z.union([z.array(z.string()), z.string()]).nullish(),
  fromTimestamp: stringDateTime,
  toTimestamp: stringDateTime,
});
export const GetMetricsDailyV1Response = z
  .object({
    data: z.array(
      z
        .object({
          date: z.string().date(),
          countTraces: z.number(),
          countObservations: z.number(),
          totalCost: z.number(),
          usage: z.array(
            z
              .object({
                model: z.string().nullable(),
                inputUsage: z.number(),
                outputUsage: z.number(),
                totalUsage: z.number(),
                countObservations: z.number(),
                countTraces: z.number(),
                totalCost: z.number(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    meta: paginationMetaResponseZod,
  })
  .strict();

/**
 * V2 API - Events Table Only
 */

// V2-specific view enum (observations only, no traces)
export const v2Views = z.enum([
  "observations", // Maps to events-observations internally
  "scores-numeric",
  "scores-categorical",
]);

// V2 Query Object (similar to v1 but with v2Views and no traceXYZ fields validation)
export const MetricsV2QueryObject = z
  .object({
    view: v2Views, // Limited to observations and scores
    dimensions: z.array(dimension).optional().default([]),
    metrics: z.array(metric),
    filters: z.array(singleFilter).optional().default([]),
    timeDimension: z
      .object({
        granularity: granularities,
      })
      .nullable()
      .optional()
      .default(null),
    fromTimestamp: z.string().datetime({ offset: true }),
    toTimestamp: z.string().datetime({ offset: true }),
    orderBy: z
      .array(
        z.object({
          field: z.string(),
          direction: z.enum(["asc", "desc"]),
        }),
      )
      .nullable()
      .optional()
      .default(null),
    config: z
      .object({
        bins: z.number().int().min(1).max(100).optional(),
        row_limit: z.number().int().positive().lte(1000).optional(),
      })
      .optional(),
  })
  .refine(
    (query) =>
      new Date(query.fromTimestamp).getTime() <
      new Date(query.toTimestamp).getTime(),
    {
      message: "fromTimestamp must be before toTimestamp",
    },
  )
  .refine(
    (query) => {
      // Validate that trace-JOIN-only dimensions are not used
      const traceJoinOnlyDimensions = [
        "traceName",
        "traceRelease",
        "traceVersion",
      ];
      const usesTraceJoinDimensions = query.dimensions?.some((dim) =>
        traceJoinOnlyDimensions.includes(dim.field),
      );
      return !usesTraceJoinDimensions;
    },
    {
      message:
        "V2 metrics API does not support the traceName, traceRelease and traceVersion dimensions.",
    },
  );

// GET /api/public/v2/metrics
export const GetMetricsV2Query = z.object({
  query: z
    .string()
    .transform((str) => {
      try {
        return JSON.parse(str);
      } catch (e) {
        throw new InvalidRequestError("Invalid JSON in query parameter");
      }
    })
    .pipe(MetricsV2QueryObject),
});

export const GetMetricsV2Response = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
});
