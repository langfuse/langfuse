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
import { performance } from "perf_hooks";

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
          const startTime = performance.now();

          const results = await Promise.all([
            obs.metadata
              ? jsonParserPool.run(obs.metadata as unknown as string)
              : Promise.resolve(undefined),
            obs.input
              ? jsonParserPool.run(obs.input as unknown as string)
              : Promise.resolve(undefined),
            obs.output
              ? jsonParserPool.run(obs.output as unknown as string)
              : Promise.resolve(undefined),
          ]);

          const mainThreadTime = performance.now() - startTime;

          const metadata = results[0]?.data;
          const inputData = results[1]?.data;
          const output = results[2]?.data;

          const totalWorkerCpuTime = results.reduce(
            (acc, r) => acc + (r?.workerCpuTime ?? 0),
            0,
          );

          return {
            ...obs,
            metadata,
            input: inputData,
            output,
            optimization: "worker",
            metrics: {
              mainThreadTime: mainThreadTime.toFixed(2) + "ms",
              totalWorkerCpuTime: totalWorkerCpuTime.toFixed(2) + "ms",
            },
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
