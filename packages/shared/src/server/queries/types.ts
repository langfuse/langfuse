import z from "zod";
import { singleFilter } from "../../interfaces/filters";
import { orderBy } from "../../interfaces/orderBy";

const TableFilterSchema = z.object({
  projectId: z.string(),
  filter: z.array(singleFilter).nullable().optional(),
  searchQuery: z.string().nullable().optional(),
  orderBy: orderBy,
});

export type TableFilters = z.infer<typeof TableFilterSchema>;
