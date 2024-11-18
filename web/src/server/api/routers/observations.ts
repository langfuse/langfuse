import {
  createTRPCRouter,
  protectedGetTraceProcedure,
} from "@/src/server/api/trpc";
import { measureAndReturnApi } from "@/src/server/utils/checkClickhouseAccess";
import { getObservationById } from "@langfuse/shared/src/server";
import { z } from "zod";

export const observationsRouter = createTRPCRouter({
  byId: protectedGetTraceProcedure
    .input(
      z.object({
        observationId: z.string(),
        traceId: z.string(), // required for protectedGetTraceProcedure
        projectId: z.string(), // required for protectedGetTraceProcedure
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      return measureAndReturnApi({
        input,
        operation: "observations.byId",
        user: ctx.session.user,
        pgExecution: async () => {
          const observation = await ctx.prisma.observation.findFirstOrThrow({
            where: {
              id: input.observationId,
              traceId: input.traceId,
              projectId: input.projectId,
            },
          });

          /* eslint-disable no-unused-vars */
          const { internalModel, ...observationWithoutInternalModel } =
            observation;
          return observationWithoutInternalModel;
        },
        clickhouseExecution: async () => {
          return getObservationById(input.observationId, input.projectId, true);
        },
      });
    }),
});
