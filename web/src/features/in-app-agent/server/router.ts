import { z } from "zod";

import {
  InvalidRequestError,
  ScoreDataTypeEnum,
  ScoreSourceEnum,
  TEXT_SCORE_MAX_LENGTH,
} from "@langfuse/shared";
import {
  convertDateToClickhouseDateTime,
  upsertScore,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import {
  AgUiContextSchema,
  getInAppAgentInstrumentationObservationId,
  getInAppAgentInstrumentationTraceId,
} from "@langfuse/shared/in-app-agent";
import { InAppAgentMessageFeedbackValueSchema } from "@langfuse/shared/in-app-agent";
import { assertInAppAgentAvailable } from "@/src/features/in-app-agent/server/availability";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedProjectProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import {
  getConversationMessages,
  getOwnedConversationOrThrow,
  serializeConversation,
} from "@langfuse/shared/in-app-agent/server/persistence";
import {
  assertInAppAgentRateLimit,
  getInAppAgentApiAccessScope,
} from "@/src/features/in-app-agent/server/rateLimit";
import {
  cancelBackgroundRun,
  decideBackgroundApproval,
  getBackgroundConversationSnapshot,
  startBackgroundRun,
} from "@/src/features/in-app-agent/server/backgroundRunService";

const CONVERSATION_LIST_LIMIT = 50;
const MAX_IN_APP_AGENT_MESSAGE_LENGTH = 32_000;

const ConversationListCursorSchema = z.object({
  updatedAt: z.date(),
  id: z.string(),
});

const ConversationIdInput = z.object({
  projectId: z.string(),
  conversationId: z.string(),
});

const RenameConversationInput = ConversationIdInput.extend({
  title: z.string().trim().min(1).max(80),
});

const StartRunInput = ConversationIdInput.extend({
  message: z.string().trim().min(1).max(MAX_IN_APP_AGENT_MESSAGE_LENGTH),
  /**
   * The same AG-UI context array the foreground path sends (current page, the
   * quick action and entry point that triggered the turn); resolved and
   * sanitized server-side, then stored on the run for the worker to replay.
   */
  context: z.array(AgUiContextSchema).default([]),
});

const CancelRunInput = ConversationIdInput.extend({
  runId: z.string(),
});

const DecideToolApprovalInput = ConversationIdInput.extend({
  runId: z.string(),
  toolCallId: z.string(),
  approved: z.boolean(),
});

const SubmitFeedbackInput = ConversationIdInput.extend({
  messageId: z.string(),
  runId: z.string(),
  value: InAppAgentMessageFeedbackValueSchema.nullable(),
  comment: z.string().trim().max(TEXT_SCORE_MAX_LENGTH).nullable().optional(),
});

const IN_APP_AGENT_FEEDBACK_SCORE_NAME = "in_app_agent_feedback";
const IN_APP_AGENT_FEEDBACK_ENVIRONMENT = "langfuse-in-app-agent";

export const inAppAgentRouter = createTRPCRouter({
  listConversations: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: ConversationListCursorSchema.optional(),
        limit: z.number().int().min(1).max(CONVERSATION_LIST_LIMIT).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertInAppAgentAvailable({
        prisma: ctx.prisma,
        projectId: input.projectId,
        user: ctx.session.user,
      });

      const conversations = await ctx.prisma.inAppAgentConversation.findMany({
        where: {
          projectId: input.projectId,
          createdByUserId: ctx.session.user.id,
          deletedAt: null,
          ...(input.cursor
            ? {
                OR: [
                  { updatedAt: { lt: input.cursor.updatedAt } },
                  {
                    updatedAt: input.cursor.updatedAt,
                    id: { lt: input.cursor.id },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });

      const page = conversations.slice(0, input.limit);
      const lastConversation = page.at(-1);

      return {
        conversations: page.map((conversation) =>
          serializeConversation(conversation),
        ),
        nextCursor:
          conversations.length > input.limit && lastConversation
            ? {
                updatedAt: lastConversation.updatedAt,
                id: lastConversation.id,
              }
            : undefined,
      };
    }),

  getConversation: protectedProjectProcedureWithoutTracing
    .input(ConversationIdInput)
    .query(async ({ ctx, input }) => {
      await assertInAppAgentAvailable({
        prisma: ctx.prisma,
        projectId: input.projectId,
        user: ctx.session.user,
      });

      return getBackgroundConversationSnapshot({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: ctx.session.user.id,
      });
    }),

  /**
   * Submit a turn for background execution.
   *
   * Runs the same validation chain as the foreground route, then commits the
   * run as QUEUED with its user message already appended — the events table is
   * the render source from the instant of submit, so there is no optimistic UI
   * state to survive a refresh. The BullMQ enqueue happens after commit; a
   * failure there marks the run FAILED immediately rather than leaving a
   * committed run nobody will execute.
   */
  startRun: protectedProjectProcedureWithoutTracing
    .input(StartRunInput)
    .mutation(async ({ ctx, input }) => {
      const projectAvailability = await assertInAppAgentAvailable({
        prisma: ctx.prisma,
        projectId: input.projectId,
        user: ctx.session.user,
      });

      await assertInAppAgentRateLimit(
        getInAppAgentApiAccessScope(
          ctx.session.user,
          input.projectId,
          projectAvailability,
        ),
        "in-app-agent-run",
      );

      return startBackgroundRun({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: ctx.session.user.id,
        message: input.message,
        context: input.context,
        isV4Enabled: ctx.session.user.v4BetaEnabled === true,
        model: env.LANGFUSE_AWS_BEDROCK_MODEL,
        aiTelemetryEnabled: projectAvailability.aiTelemetryEnabled,
      });
    }),

  cancelRun: protectedProjectProcedureWithoutTracing
    .input(CancelRunInput)
    .mutation(async ({ ctx, input }) => {
      await assertInAppAgentAvailable({
        prisma: ctx.prisma,
        projectId: input.projectId,
        user: ctx.session.user,
      });

      return cancelBackgroundRun({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        runId: input.runId,
        userId: ctx.session.user.id,
      });
    }),

  /**
   * Decide a pending tool approval.
   *
   * The client sends only IDs and a boolean. The tool name and arguments are
   * read server-side from the persisted interrupt event, so there is nothing
   * to tamper with on the way back and no fingerprint to keep in sync.
   */
  decideToolApproval: protectedProjectProcedureWithoutTracing
    .input(DecideToolApprovalInput)
    .mutation(async ({ ctx, input }) => {
      const projectAvailability = await assertInAppAgentAvailable({
        prisma: ctx.prisma,
        projectId: input.projectId,
        user: ctx.session.user,
      });

      await assertInAppAgentRateLimit(
        getInAppAgentApiAccessScope(
          ctx.session.user,
          input.projectId,
          projectAvailability,
        ),
        "in-app-agent-run",
      );

      return decideBackgroundApproval({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        runId: input.runId,
        toolCallId: input.toolCallId,
        approved: input.approved,
        userId: ctx.session.user.id,
        model: env.LANGFUSE_AWS_BEDROCK_MODEL,
      });
    }),

  deleteConversation: protectedProjectProcedureWithoutTracing
    .input(ConversationIdInput)
    .mutation(async ({ ctx, input }) => {
      await assertInAppAgentAvailable({
        prisma: ctx.prisma,
        projectId: input.projectId,
        user: ctx.session.user,
      });

      await getOwnedConversationOrThrow({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: ctx.session.user.id,
      });

      await ctx.prisma.inAppAgentConversation.update({
        where: {
          id_projectId: {
            id: input.conversationId,
            projectId: input.projectId,
          },
        },
        data: {
          providerSessionId: null,
          deletedAt: new Date(),
        },
      });

      return { success: true };
    }),

  renameConversation: protectedProjectProcedureWithoutTracing
    .input(RenameConversationInput)
    .mutation(async ({ ctx, input }) => {
      await assertInAppAgentAvailable({
        prisma: ctx.prisma,
        projectId: input.projectId,
        user: ctx.session.user,
      });

      await getOwnedConversationOrThrow({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: ctx.session.user.id,
      });

      const conversation = await ctx.prisma.inAppAgentConversation.update({
        where: {
          id_projectId: {
            id: input.conversationId,
            projectId: input.projectId,
          },
          createdByUserId: ctx.session.user.id,
          deletedAt: null,
        },
        data: {
          title: input.title,
          renamedByUserAt: new Date(),
        },
      });

      return { conversation: serializeConversation(conversation) };
    }),

  submitFeedback: protectedProjectProcedureWithoutTracing
    .input(SubmitFeedbackInput)
    .mutation(async ({ ctx, input }) => {
      const projectAvailability = await assertInAppAgentAvailable({
        prisma: ctx.prisma,
        projectId: input.projectId,
        user: ctx.session.user,
      });

      await getOwnedConversationOrThrow({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: ctx.session.user.id,
      });

      const messages = await getConversationMessages({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
      });
      const targetMessage = messages.find(
        (message) => message.id === input.messageId,
      );

      if (
        targetMessage?.role !== "assistant" ||
        typeof targetMessage.content !== "string" ||
        targetMessage.content.length === 0
      ) {
        throw new InvalidRequestError(
          "Feedback can only be submitted for assistant text messages",
        );
      }

      if (targetMessage.runId !== input.runId) {
        throw new InvalidRequestError(
          "Feedback can only be submitted for persisted assistant messages",
        );
      }

      const comment = input.comment?.trim() ? input.comment.trim() : null;
      if (input.value === null) {
        return { feedback: null };
      }

      const scoreId = `afbs_${input.messageId}_${ctx.session.user.id}`;
      const now = new Date();
      const scoreProjectId = env.LANGFUSE_AI_FEATURES_PROJECT_ID;

      if (projectAvailability.aiTelemetryEnabled && scoreProjectId) {
        await upsertScore({
          id: scoreId,
          timestamp: convertDateToClickhouseDateTime(now),
          project_id: scoreProjectId,
          environment: IN_APP_AGENT_FEEDBACK_ENVIRONMENT,
          trace_id: getInAppAgentInstrumentationTraceId(input.runId),
          observation_id: getInAppAgentInstrumentationObservationId(
            input.runId,
          ),
          session_id: input.conversationId,
          name: IN_APP_AGENT_FEEDBACK_SCORE_NAME,
          value: input.value === "thumbs_up" ? 1 : 0,
          source: ScoreSourceEnum.ANNOTATION,
          comment,
          author_user_id: ctx.session.user.id,
          config_id: null,
          data_type: ScoreDataTypeEnum.BOOLEAN,
          string_value: input.value === "thumbs_up" ? "true" : "false",
          queue_id: null,
          created_at: convertDateToClickhouseDateTime(now),
          updated_at: convertDateToClickhouseDateTime(now),
          metadata: {
            project_id: input.projectId,
            conversation_id: input.conversationId,
            message_id: input.messageId,
          },
        });
      }

      return { feedback: { value: input.value, comment } };
    }),
});
