import { createTRPCRouter } from "@/src/server/api/trpc";
import { filterOptionsQuery } from "./filterOptionsQuery";
import { getAllQueries } from "./getAllQueries";

export const generationsRouter = createTRPCRouter({
  ...getAllQueries,
  filterOptions: filterOptionsQuery,
});
