import {
  createTRPCRouter,
  protectedGetTraceProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { LangfuseNotFoundError, parseIO } from "@langfuse/shared";
import {
  getObservationById,
  getObservationsById,
} from "@langfuse/shared/src/server";
import { z } from "zod";
import {
  toDomainArrayWithStringifiedMetadata,
  toDomainWithStringifiedMetadata,
} from "@/src/utils/clientSideDomainTypes";

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
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const obs = await getObservationById(queryOpts);
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
  // Batched counterpart to `byId`. Used by views (e.g. the dataset run
  // comparison grid) that need many observations at once and would
  // otherwise fire one `byId` request per cell. Project membership (checked
  // by protectedProjectProcedure) is sufficient here because this endpoint
  // is read-only and scoped to the caller's own project.
  byIds: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        observationIds: z.array(z.string()),
      }),
    )
    .query(async ({ input }) => {
      if (input.observationIds.length === 0) return [];

      const observations = await getObservationsById(
        input.observationIds,
        input.projectId,
        true, // fetchWithInputOutput
      );

      return toDomainArrayWithStringifiedMetadata(observations).map((obs) => ({
        ...obs,
        input: obs.input as string,
        output: obs.output as string,
        internalModel: obs.internalModelId,
      }));
    }),
});
