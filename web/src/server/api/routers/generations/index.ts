import { createTRPCRouter } from "@/src/server/api/trpc";

import { generationsExportQuery } from "./exportQuery";
import { filterOptionsQuery } from "./filterOptionsQuery";
import { getAllQuery } from "./getAllQuery";
import { getScoreNamesQuery } from "@/src/server/api/routers/generations/getScoreNamesQuery";

export const generationsRouter = createTRPCRouter({
  all: getAllQuery,
  export: generationsExportQuery,
  filterOptions: filterOptionsQuery,
  scoreNames: getScoreNamesQuery,
});
