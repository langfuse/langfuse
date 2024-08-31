import { createTRPCRouter } from "@/src/server/api/trpc";

import { generationsExportQuery } from "./exportQuery";
import { filterOptionsQuery } from "./filterOptionsQuery";
import { getAllQueries } from "./getAllQueries";

export const generationsRouter = createTRPCRouter({
  ...getAllQueries,
  export: generationsExportQuery,
  filterOptions: filterOptionsQuery,
});
