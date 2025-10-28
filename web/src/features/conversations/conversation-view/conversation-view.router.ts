import z4, { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { createSupabaseAdminClient } from "@/src/server/supabase";
import {
  getTraceById,
  getTracesIdentifierForSession,
  logger,
  getScoresUiTable,
  upsertScore,
  getScoreById,
  deleteScores,
  convertDateToClickhouseDateTime,
} from "@langfuse/shared/src/server";
import { getFilteredSessions } from "../server/conversations-service";
import { ScoreSource } from "@langfuse/shared";
import { TRPCError } from "@trpc/server";
import { v4 } from "uuid";

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

  getRecentConversationsForUser: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
        limit: z.number().default(20),
      }),
    )
    .query(async ({ input }) => {
      try {
        // Get recent sessions for the specific user
        const sessions = await getFilteredSessions({
          projectId: input.projectId,
          allowedUserIds: [input.userId],
          orderBy: { column: "createdAt", order: "ASC" },
          limit: input.limit,
          page: 0,
        });

        return {
          sessions: sessions.map(
            (s: {
              session_id: string;
              user_ids: string[];
              min_timestamp: string;
            }) => ({
              id: s.session_id,
              userIds: s.user_ids,
              createdAt: new Date(s.min_timestamp),
            }),
          ),
        };
      } catch (e) {
        logger.error(
          "Unable to call conversations.getRecentConversationsForUser",
          e,
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to get recent conversations for user",
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
          id: existing.id,
          project_id: existing.projectId,
          name: existing.name,
          timestamp: convertDateToClickhouseDateTime(new Date()),
          value: input.value ?? existing.value,
          string_value: input.stringValue ?? existing.stringValue,
          comment: input.comment ?? existing.comment,
          updated_at: convertDateToClickhouseDateTime(new Date()),
          created_at: existing.createdAt
            ? convertDateToClickhouseDateTime(new Date(existing.createdAt))
            : convertDateToClickhouseDateTime(new Date()),
          data_type: existing.dataType,
          config_id: existing.configId,
          source: existing.source,
          author_user_id: existing.authorUserId,
          environment: existing.environment,
          trace_id: existing.traceId,
          observation_id: existing.observationId,
          session_id: existing.sessionId,
          dataset_run_id: existing.datasetRunId,
          queue_id: existing.queueId,
          metadata: {}, // always use empty object for metadata for now
        };
      } else {
        // Create new score
        scoreToUpsert = {
          id: v4(),
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
          created_at: convertDateToClickhouseDateTime(new Date()),
          updated_at: convertDateToClickhouseDateTime(new Date()),
          timestamp: convertDateToClickhouseDateTime(new Date()),
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

  getInternalThoughts: protectedProjectProcedure
    .input(
      z
        .object({
          projectId: z.string(),
          // New fields for newer DJBThoughts format
          threadId: z.string().optional(),
          messageId: z.string().optional(),
          // Fallback field for older format
          messageText: z.string().optional(),
          traceId: z.string().optional(),
        })
        .refine(
          (data) => (data.threadId && data.messageId) || data.messageText,
          {
            message:
              "Either threadId and messageId, or messageText must be provided",
          },
        ),
    )
    .query(async ({ input }) => {
      try {
        const supabase = createSupabaseAdminClient();

        let data, error;

        // Use new lookup method if thread_id and message_id are provided
        if (input.threadId && input.messageId) {
          // Query by JSON path to find thinking records with matching thread_id and message_id
          const { data: newData, error: newError } = await supabase
            .schema("public")
            .from("messages")
            .select("thinking")
            .not("thinking", "is", null)
            .eq("thinking->>thread_id", input.threadId)
            .eq("thinking->>message_id", input.messageId);

          data = newData;
          error = newError;
        } else if (input.messageText) {
          // Fallback to old method - lookup by message text content
          const { data: oldData, error: oldError } = await supabase
            .schema("public")
            .from("messages")
            .select("thinking")
            .eq("message", input.messageText)
            .not("thinking", "is", null);

          data = oldData;
          error = oldError;
        } else {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Either threadId and messageId, or messageText must be provided",
          });
        }

        if (error) {
          logger.error("Error fetching thinking data from Supabase", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch internal thoughts",
          });
        }

        // Debug log to check the query results
        console.log("Internal thoughts query results:", {
          threadId: input.threadId,
          messageId: input.messageId,
          messageText: input.messageText,
          traceId: input.traceId,
          rawData: data,
          thoughtsCount: data?.length || 0,
          thoughts: data?.map((row) => row.thinking).filter(Boolean) || [],
        });

        return {
          thoughts: data?.map((row) => row.thinking).filter(Boolean) || [],
        };
      } catch (e) {
        logger.error("Unable to call conversation.getInternalThoughts", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to get internal thoughts",
        });
      }
    }),
});
