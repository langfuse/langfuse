import { env } from "@/src/env.mjs";
import {
  createTRPCRouter,
  protectedGetTraceProcedure,
} from "@/src/server/api/trpc";
import { LangfuseNotFoundError } from "@langfuse/shared";
import {
  getObservationById,
  getObservationByIdFromEventsTable,
} from "@langfuse/shared/src/server";
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
      const queryOpts = {
        id: input.observationId,
        projectId: input.projectId,
        fetchWithInputOutput: true,
        traceId: input.traceId,
        startTime: input.startTime ?? undefined,
        renderingProps: {
          truncated: input.truncated,
          shouldJsonParse: false,
        },
      };
      const obs =
        env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
          ? await getObservationByIdFromEventsTable(queryOpts)
          : await getObservationById(queryOpts);
      if (!obs) {
        throw new LangfuseNotFoundError(
          "Observation not found within authorized project",
        );
      }
      return {
        ...obs,
        input: obs.input as string,
        output: obs.output as string,
        metadata: obs.metadata != null ? JSON.stringify(obs.metadata) : null,
        internalModel: obs?.internalModelId,
      };
    }),
});
