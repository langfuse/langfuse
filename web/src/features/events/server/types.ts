import { z } from "zod";
import {
  hasValidTracingSearchTypes,
  singleFilter,
  TRACING_SEARCH_TYPE_REQUIRED_MESSAGE,
  TracingSearchType,
  orderBy,
} from "@langfuse/shared";
import { MAX_EVENTS_METRICS_TIME_SERIES_BINS } from "@langfuse/shared/src/server";

export const EventsTableOptions = z
  .object({
    projectId: z.string(), // Required for protectedProjectProcedure
    filter: z.array(singleFilter),
    searchQuery: z.string().nullable(),
    searchType: z.array(TracingSearchType),
    orderBy: orderBy,
  })
  .refine(hasValidTracingSearchTypes, {
    message: TRACING_SEARCH_TYPE_REQUIRED_MESSAGE,
    path: ["searchType"],
  });

export const EventsMetricsTimeSeriesOptions = z
  .object({
    projectId: z.string(), // Required for protectedProjectProcedure
    filter: z.array(singleFilter),
    searchQuery: z.string().nullable(),
    searchType: z.array(TracingSearchType),
    fromTimestamp: z.date(),
    toTimestamp: z.date(),
    // Epoch-aligned bucket width; the client picks it from its step ladder so
    // bars fit the measured strip width.
    stepSeconds: z.number().int().positive(),
  })
  .refine(hasValidTracingSearchTypes, {
    message: TRACING_SEARCH_TYPE_REQUIRED_MESSAGE,
    path: ["searchType"],
  })
  .refine((input) => input.toTimestamp > input.fromTimestamp, {
    message: "toTimestamp must be after fromTimestamp",
    path: ["toTimestamp"],
  })
  .refine(
    (input) =>
      (input.toTimestamp.getTime() - input.fromTimestamp.getTime()) /
        (input.stepSeconds * 1000) <=
      MAX_EVENTS_METRICS_TIME_SERIES_BINS,
    {
      message: `stepSeconds would produce more than ${MAX_EVENTS_METRICS_TIME_SERIES_BINS} buckets for the requested range`,
      path: ["stepSeconds"],
    },
  );
