import { createTRPCRouter } from "@/src/server/api/trpc";

import { generationsExportQuery } from "./exportQuery";
import { filterOptionsQuery } from "./filterOptionsQuery";
import { getAllQuery } from "./getAllQuery";

export const generationsRouter = createTRPCRouter({
  all: getAllQuery,
  export: generationsExportQuery,
  filterOptions: filterOptionsQuery,
});
