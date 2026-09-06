import { z } from "zod";
import {
  hasValidTracingSearchTypes,
  singleFilter,
  TRACING_SEARCH_TYPE_REQUIRED_MESSAGE,
  TracingSearchType,
  orderBy,
} from "@langfuse/shared";

const eventsTableOptionsShape = {
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
  searchQuery: z.string().nullable(),
  searchType: z.array(TracingSearchType),
};

const searchTypeRefinementParams = {
  message: TRACING_SEARCH_TYPE_REQUIRED_MESSAGE,
  path: ["searchType"] satisfies PropertyKey[],
};

export const EventsTableOptions = z
  .object({
    ...eventsTableOptionsShape,
    orderBy: orderBy,
  })
  .refine(hasValidTracingSearchTypes, searchTypeRefinementParams);

/**
 * Cursor pagination reads the events table in its stable tuple order
 * (start_time, trace_id, span_id) and cannot honour an arbitrary sort, so the
 * caller's `orderBy` is deliberately absent instead of silently ignored.
 */
export const EventsCursorTableOptions = z
  .object(eventsTableOptionsShape)
  .refine(hasValidTracingSearchTypes, searchTypeRefinementParams);
