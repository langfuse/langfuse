import {
  createTRPCRouter,
  protectedGetTraceProcedure,
} from "@/src/server/api/trpc";
import { isClickhouseEligible } from "@/src/server/utils/checkClickhouseAccess";
import {
  type jsonSchema,
  type ObservationLevel,
  type ObservationType,
} from "@langfuse/shared";
import { getObservationById } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import type Decimal from "decimal.js";
import { z } from "zod";

export type SingleObservationReturnType = {
  name: string | null;
  id: string;
  createdAt: Date;
  updatedAt: Date;
  type: ObservationType;
  traceId: string | null;
  projectId: string;
  input: z.infer<typeof jsonSchema> | null;
  startTime: Date;
  endTime: Date | null;
  metadata: z.infer<typeof jsonSchema> | null;
  parentObservationId: string | null;
  level: ObservationLevel;
  statusMessage: string | null;
  version: string | null;
  model: string | null;
  internalModel: string | null;
  internalModelId: string | null;
  modelParameters: z.infer<typeof jsonSchema> | null;
  output: z.infer<typeof jsonSchema> | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  unit: string | null;
  inputCost: Decimal | null;
  outputCost: Decimal | null;
  totalCost: Decimal | null;
  calculatedInputCost: Decimal | null;
  calculatedOutputCost: Decimal | null;
  calculatedTotalCost: Decimal | null;
  completionStartTime: Date | null;
  promptId: string | null;
};

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
      if (!input.queryClickhouse) {
        return ctx.prisma.observation.findFirstOrThrow({
          where: {
            id: input.observationId,
            traceId: input.traceId,
            projectId: input.projectId,
          },
        });
      } else {
        if (!isClickhouseEligible(ctx.session.user)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Not eligible to query clickhouse",
          });
        }
        return await getObservationById(
          input.observationId,
          input.projectId,
          true,
        );
      }
    }),
});
