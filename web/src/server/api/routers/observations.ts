import {
  createTRPCRouter,
  protectedGetTraceProcedure,
} from "@/src/server/api/trpc";
import { measureAndReturnApi } from "@/src/server/utils/checkClickhouseAccess";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { getObservationById } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
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
          return await ctx.prisma.observation.findFirstOrThrow({
            where: {
              id: input.observationId,
              traceId: input.traceId,
              projectId: input.projectId,
            },
          });
        },
        clickhouseExecution: async () => {
          const obs = await getObservationById(
            input.observationId,
            input.projectId,
            true,
          );
          if (!obs) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Observation not found within authorized project",
            });
          }
          return {
            ...obs,
            internalModel: obs?.internalModelId,
          };
        },
      });
    }),
});
