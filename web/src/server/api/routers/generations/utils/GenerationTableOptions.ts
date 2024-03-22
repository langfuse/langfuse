import { z } from "zod";
import { singleFilter } from "@/src/server/api/interfaces/filters";
import { orderBy } from "@/src/server/api/interfaces/orderBy";

export const GenerationTableOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
  searchQuery: z.string().nullable(),
  orderBy: orderBy,
});
