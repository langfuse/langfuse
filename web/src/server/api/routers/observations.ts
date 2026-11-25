import {
  createTRPCRouter,
  protectedGetTraceProcedure,
} from "@/src/server/api/trpc";
import {
  auditedQuery,
  ref,
} from "@/src/features/audit-logs/server/auditedQuery";
import { LangfuseNotFoundError, parseIO } from "@langfuse/shared";
import { getObservationById } from "@langfuse/shared/src/server";
import { z } from "zod";
import { toDomainWithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

export const observationsRouter = createTRPCRouter({
  byId: auditedQuery(
    protectedGetTraceProcedure.input(
      z.object({
        observationId: z.string(),
        traceId: z.string(), // required for protectedGetTraceProcedure
        projectId: z.string(), // required for protectedGetTraceProcedure
        startTime: z.date().nullish(),
        verbosity: z.enum(["compact", "truncated", "full"]).default("full"),
      }),
    ),
    { resourceType: "observation", action: "read", idKey: "observationId" },
    async ({ input, ctx, audit }) => {
      const queryOpts = {
        id: input.observationId,
        projectId: input.projectId,
        fetchWithInputOutput: ctx.canReadTraceMessages,
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
      audit.refs([ref("trace", input.traceId)]);
      return {
        ...toDomainWithStringifiedMetadata(obs),
        input: ctx.canReadTraceMessages
          ? (parseIO(obs.input, input.verbosity) as string)
          : null,
        output: ctx.canReadTraceMessages
          ? (parseIO(obs.output, input.verbosity) as string)
          : null,
        ...(ctx.canReadTraceMessages
          ? {}
          : {
              toolCalls: null,
              toolDefinitions: null,
            }),
        internalModel: obs?.internalModelId,
      };
    },
  ),
});
