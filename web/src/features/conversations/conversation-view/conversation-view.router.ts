import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  getTraceById,
  getTracesIdentifierForSession,
  logger,
} from "@langfuse/shared/src/server";
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
});
