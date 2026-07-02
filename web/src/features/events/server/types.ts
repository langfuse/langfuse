import { z } from "zod";
import { filterInput, TracingSearchType, orderBy } from "@langfuse/shared";

export const EventsTableOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  // Accepts a flat FilterState array OR a nested FilterExpression tree
  // (Search/Filter v2). Bounds (depth/node caps) are enforced by `filterInput`.
  filter: filterInput,
  searchQuery: z.string().nullable(),
  searchType: z.array(TracingSearchType),
  orderBy: orderBy,
});
