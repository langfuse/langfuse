import {
  createTRPCRouter,
  protectedGetTraceProcedure,
} from "@/src/server/api/trpc";
import { measureAndReturnApi } from "@/src/server/utils/checkClickhouseAccess";
import { getObservationById } from "@langfuse/shared/src/server";
import type Decimal from "decimal.js";
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
          /* eslint-disable no-unused-vars */
          const { internalModel, ...rest } =
            await ctx.prisma.observation.findFirstOrThrow({
              where: {
                id: input.observationId,
                traceId: input.traceId,
                projectId: input.projectId,
              },
            });
          return rest;
        },
        clickhouseExecution: async () => {
          return getObservationById(input.observationId, input.projectId, true);
        },
      });
    }),
});
