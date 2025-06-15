import { type z } from "zod/v4";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { paginationZod } from "@langfuse/shared";
import { GenerationTableOptions } from "./utils/GenerationTableOptions";
import { getAllGenerations } from "@/src/server/api/routers/generations/db/getAllGenerationsSqlQuery";
import { getObservationsTableCount } from "@langfuse/shared/src/server";

const GetAllGenerationsInput = GenerationTableOptions.extend({
  ...paginationZod,
});

export type GetAllGenerationsInput = z.infer<typeof GetAllGenerationsInput>;

export const getAllQueries = {
  all: protectedProjectProcedure
    .input(GetAllGenerationsInput)
    .query(async ({ input }) => {
      const { generations } = await getAllGenerations({
        input,
        selectIOAndMetadata: false,
      });
      return { generations };
    }),
  countAll: protectedProjectProcedure
    .input(GetAllGenerationsInput)
    .query(async ({ input, ctx }) => {
      const countQuery = await getObservationsTableCount({
        projectId: ctx.session.projectId,
        filter: input.filter ?? [],
        limit: 1,
        offset: 0,
      });
      return {
        totalCount: countQuery,
      };
    }),
};
