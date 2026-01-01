import z from "zod/v4";
import { singleFilter } from "../../interfaces/filters";
import { orderBy } from "../../interfaces/orderBy";
import { optionalPaginationZod } from "../../utils/zod";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TableFilterSchema = z.object({
  projectId: z.string(),
  filter: z.array(singleFilter).nullish(),
  searchQuery: z.string().nullish(),
  orderBy: orderBy,
  ...optionalPaginationZod,
});

export type TableFilters = z.infer<typeof TableFilterSchema>;
