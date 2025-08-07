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
        truncated: z.boolean().default(false), // used to truncate the input and output
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
          renderingProps: {
            truncated: input.truncated,
            shouldJsonParse: false,
          },
        });
        if (!obs) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Observation not found within authorized project",
          });
        }
        return {
          ...obs,
          input: obs.input as string,
          output: obs.output as string,
          metadata: obs.metadata != null ? JSON.stringify(obs.metadata) : null,
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
