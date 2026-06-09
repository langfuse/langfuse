import { z } from "zod";
import { filterInput, TracingSearchType, orderBy } from "@langfuse/shared";

export const EventsTableOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: filterInput,
  searchQuery: z.string().nullable(),
  searchType: z.array(TracingSearchType),
  orderBy: orderBy,
});
