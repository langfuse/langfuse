import z from "zod";
import { singleFilter } from "../../interfaces/filters";
import { orderBy } from "../../interfaces/orderBy";

const TableFilterSchema = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
  searchQuery: z.string().nullable().optional(),
  orderBy: orderBy,
});

export type TableFilters = z.infer<typeof TableFilterSchema>;
