import { createTRPCRouter } from "@/src/server/api/trpc";
import { filterOptionsQuery } from "./filterOptionsQuery";
import { getAllQueries } from "./getAllQueries";

export const eventsRouter = createTRPCRouter({
  ...getAllQueries,
  filterOptions: filterOptionsQuery,
});
