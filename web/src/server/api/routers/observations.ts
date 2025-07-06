import {
  createTRPCRouter,
  protectedGetTraceProcedure,
} from "@/src/server/api/trpc";
import {
  JSON_OPTIMIZATION_STRATEGIES,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { getObservationById } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { jsonParserPool } from "@/src/server/utils/json/WorkerPool";

export const observationsRouter = createTRPCRouter({
  byId: protectedGetTraceProcedure
    .input(
      z.object({
        observationId: z.string(),
        traceId: z.string(), // required for protectedGetTraceProcedure
        projectId: z.string(), // required for protectedGetTraceProcedure
        startTime: z.date().nullish(),
        optimization: z.enum(JSON_OPTIMIZATION_STRATEGIES).optional(),
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
          optimization: input.optimization,
        });
        if (!obs) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Observation not found within authorized project",
          });
        }

        if (input.optimization === "worker") {
          const { results, metrics } = await jsonParserPool.runParallel([
            obs.metadata as unknown as string,
            obs.input as unknown as string,
            obs.output as unknown as string,
          ]);

          const [metadata, inputData, output] = results;

          return {
            ...obs,
            metadata,
            input: inputData,
            output,
            optimization: "worker",
            metrics,
          };
        }

        return {
          ...obs,
          input:
            input.optimization === "raw"
              ? obs.input
              : obs.input
                ? JSON.stringify(obs.input)
                : null,
          output:
            input.optimization === "raw"
              ? obs.output
              : obs.output
                ? JSON.stringify(obs.output)
                : null,
          metadata:
            input.optimization === "raw"
              ? obs.metadata
              : obs.metadata
                ? JSON.stringify(obs.metadata)
                : null,
          internalModel: obs?.internalModelId,
          optimization:
            input?.optimization !== "original" ? input.optimization : undefined,
        } as const;
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
