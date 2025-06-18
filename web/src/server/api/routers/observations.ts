import {
  createTRPCRouter,
  protectedGetTraceProcedure,
} from "@/src/server/api/trpc";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { getObservationById } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

export const observationsRouter = createTRPCRouter({
  byId: protectedGetTraceProcedure
    .input(
      z.object({
        observationId: z.string(),
        traceId: z.string(), // required for protectedGetTraceProcedure
        projectId: z.string(), // required for protectedGetTraceProcedure
        startTime: z.date().nullish(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const obs = await getObservationById({
          id: input.observationId,
          projectId: input.projectId,
          fetchWithInputOutput: true,
          traceId: input.traceId,
          startTime: input.startTime ?? undefined,
        });
        if (!obs) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Observation not found within authorized project",
          });
        }
        return {
          ...obs,
          input: obs.input ? JSON.stringify(obs.input) : null,
          output: obs.output ? JSON.stringify(obs.output) : null,
          metadata: obs.metadata ? JSON.stringify(obs.metadata) : null,
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
