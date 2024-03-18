import { z } from "zod";
import { singleFilter } from "shared/src/interfaces/filters";
import { orderBy } from "shared/src/interfaces/orderBy";

export const GenerationTableOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
  searchQuery: z.string().nullable(),
  orderBy: orderBy,
});
