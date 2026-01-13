import { z } from "zod/v4";
import { singleFilter, TracingSearchType, orderBy } from "@langfuse/shared";

export const EventsTableOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
  searchQuery: z.string().nullable(),
  searchType: z.array(TracingSearchType),
  orderBy: orderBy,
});
