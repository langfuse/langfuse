import { env } from "@/src/env.mjs";
import {
  createTRPCRouter,
  protectedGetTraceProcedure,
} from "@/src/server/api/trpc";
import { LangfuseNotFoundError, parseIO } from "@langfuse/shared";
import {
  getObservationById,
  getObservationByIdFromEventsTable,
} from "@langfuse/shared/src/server";
import { z } from "zod/v4";
import { toDomainWithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

export const observationsRouter = createTRPCRouter({
  byId: protectedGetTraceProcedure
    .input(
      z.object({
        observationId: z.string(),
        traceId: z.string(), // required for protectedGetTraceProcedure
        projectId: z.string(), // required for protectedGetTraceProcedure
        startTime: z.date().nullish(),
        verbosity: z.enum(["compact", "truncated", "full"]).default("full"),
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
          truncated: input.verbosity === "truncated",
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
        ...toDomainWithStringifiedMetadata(obs),
        input: parseIO(obs.input, input.verbosity) as string,
        output: parseIO(obs.output, input.verbosity) as string,
        internalModel: obs?.internalModelId,
      };
    }),
});
