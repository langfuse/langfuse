import {
  createTRPCRouter,
  protectedGetTraceProcedure,
} from "@/src/server/api/trpc";
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
        startTime: z.date().nullish(),
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input }) => {
      try {
        const obs = await getObservationById(
          input.observationId,
          input.projectId,
          true,
          input.startTime ?? undefined,
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
      } catch (e) {
        if (e instanceof LangfuseNotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Observation not found within authorized project",
          });
        }
        throw e;
      }
    }),
});
