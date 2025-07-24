import z4, { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  getTraceById,
  getTracesIdentifierForSession,
  logger,
  getScoresUiTable,
  upsertScore,
  getScoreById,
  deleteScores,
} from "@langfuse/shared/src/server";
import { ScoreSource } from "@langfuse/shared";
import { TRPCError } from "@trpc/server";

export type ConversationTraceMessage = {
  id: string;
  name: string | null;
  timestamp: Date;
  input: string | null;
  output: string | null;
  userId: string | null;
  metadata: string | null;
  tags: string[];
  environment: string | null;
};

export const conversationScoreInput = z4.object({
  projectId: z.string(),
  traceId: z.string(),
  name: z.string(),
  value: z.number().nullable().optional(),
  stringValue: z.string().nullable().optional(),
  dataType: z.enum(["NUMERIC", "CATEGORICAL", "BOOLEAN"] as const),
  configId: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

export const conversationScoreUpdateInput = z.object({
  projectId: z.string(),
  scoreId: z.string(),
  value: z.number().nullable().optional(),
  stringValue: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

export const conversationScoreDeleteInput = z.object({
  projectId: z.string(),
  scoreId: z.string(),
});

export const conversationRouter = createTRPCRouter({
  getSessionTraces: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        sessionId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        // Get trace identifiers for the session from ClickHouse
        const traceIdentifiers = await getTracesIdentifierForSession(
          ctx.session.projectId,
          input.sessionId,
        );

        // Fetch detailed data for each trace from ClickHouse
        const conversationTraces: (ConversationTraceMessage | null)[] =
          await Promise.all(
            traceIdentifiers.map(async (traceId) => {
              try {
                const detailedTrace = await getTraceById({
                  traceId: traceId.id,
                  projectId: ctx.session.projectId,
                  timestamp: traceId.timestamp,
                });

                if (!detailedTrace) {
                  return null;
                }

                return {
                  id: detailedTrace.id,
                  name: detailedTrace.name,
                  timestamp: detailedTrace.timestamp,
                  input: detailedTrace.input
                    ? JSON.stringify(detailedTrace.input)
                    : null,
                  output: detailedTrace.output
                    ? JSON.stringify(detailedTrace.output)
                    : null,
                  userId: detailedTrace.userId,
                  metadata: detailedTrace.metadata
                    ? JSON.stringify(detailedTrace.metadata)
                    : null,
                  tags: detailedTrace.tags,
                  environment: detailedTrace.environment,
                };
              } catch (error) {
                logger.warn(
                  `Failed to fetch detailed trace data for ${traceId.id}`,
                  error,
                );
                return null;
              }
            }),
          );

        // Filter out null values and sort by timestamp
        const validTraces = conversationTraces
          .filter((trace): trace is ConversationTraceMessage => trace !== null)
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        return {
          traces: validTraces,
          totalCount: validTraces.length,
        };
      } catch (e) {
        logger.error("Unable to call conversations.getSessionTraces", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to get session traces",
        });
      }
    }),

  getScoresForTraces: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        traceIds: z.array(z.string()).min(1),
      }),
    )
    .query(async ({ input }) => {
      // Use getScoresUiTable to fetch all scores for these traceIds
      const scores = await getScoresUiTable({
        projectId: input.projectId,
        filter: [
          {
            column: "traceId",
            operator: "any of",
            value: input.traceIds,
            type: "stringOptions",
          },
        ],
        orderBy: null,
        limit: 1000,
        offset: 0,
        excludeMetadata: true,
      });
      return { scores };
    }),
  upsertScore: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        scoreId: z.string().optional(),
        traceId: z.string(),
        name: z.string(),
        value: z.number().nullable().optional(),
        stringValue: z.string().nullable().optional(),
        dataType: z.enum(["NUMERIC", "CATEGORICAL", "BOOLEAN"] as const),
        configId: z.string().nullable().optional(),
        comment: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      let scoreToUpsert;
      if (input.scoreId) {
        // Update existing score
        const existing = await getScoreById({
          projectId: input.projectId,
          scoreId: input.scoreId,
          source: ScoreSource.ANNOTATION,
        });
        if (!existing)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Score not found",
          });
        scoreToUpsert = {
          ...existing,
          value: input.value ?? existing.value,
          string_value: input.stringValue ?? existing.stringValue,
          comment: input.comment ?? existing.comment,
          updated_at: new Date().toISOString(),
          created_at: existing.createdAt
            ? new Date(existing.createdAt).toISOString()
            : undefined,
          timestamp: existing.timestamp
            ? new Date(existing.timestamp).toISOString()
            : undefined,
          metadata: {}, // always use empty object for metadata for now
        };
      } else {
        // Create new score
        scoreToUpsert = {
          id: undefined,
          project_id: input.projectId,
          trace_id: input.traceId,
          name: input.name,
          value: input.value ?? null,
          string_value: input.stringValue ?? null,
          data_type: input.dataType,
          config_id: input.configId ?? null,
          comment: input.comment ?? null,
          source: ScoreSource.ANNOTATION,
          author_user_id: ctx.session.user.id,
          environment: "default",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          timestamp: new Date().toISOString(),
          session_id: null,
          dataset_run_id: null,
          observation_id: null,
          queue_id: null,
          metadata: {},
        };
      }
      await upsertScore(scoreToUpsert);
      return { success: true };
    }),
  deleteScore: protectedProjectProcedure
    .input(conversationScoreDeleteInput)
    .mutation(async ({ input }) => {
      await deleteScores(input.projectId, [input.scoreId]);
      return { success: true };
    }),
});
