import { z } from "zod";
import {
  hasValidTracingSearchTypes,
  singleFilter,
  TRACING_SEARCH_TYPE_REQUIRED_MESSAGE,
  TracingSearchType,
} from "@langfuse/shared";
import { orderBy } from "@langfuse/shared";

export const GenerationTableOptions = z
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
