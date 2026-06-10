import { z } from "zod";
import type { Session } from "next-auth";

import {
  BaseError,
  ForbiddenError,
  InvalidRequestError,
  ScoreDataTypeEnum,
  ScoreSourceEnum,
  TEXT_SCORE_MAX_LENGTH,
} from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  convertDateToClickhouseDateTime,
  upsertScore,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { InAppAgentMessageFeedbackValueSchema } from "@/src/ee/features/in-app-agent/schema";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedProjectProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import {
  getConversationMessages,
  getOwnedConversationOrThrow,
  serializeConversation,
} from "@/src/ee/features/in-app-agent/server/persistence";

const CONVERSATION_LIST_LIMIT = 50;

const ConversationListCursorSchema = z.object({
  updatedAt: z.date(),
  id: z.string(),
});

const ConversationIdInput = z.object({
  projectId: z.string(),
  conversationId: z.string(),
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
      await assertInAppAgentAvailable({ ctx, projectId: input.projectId });

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
        conversations: page.map(serializeConversation),
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
      await assertInAppAgentAvailable({ ctx, projectId: input.projectId });

      const conversation = await getOwnedConversationOrThrow({
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

      return {
        conversation: serializeConversation(conversation),
        messages,
        state: {
          type: "existingConversation" as const,
          projectId: input.projectId,
          conversationId: input.conversationId,
        },
      };
    }),

  submitFeedback: protectedProjectProcedureWithoutTracing
    .input(SubmitFeedbackInput)
    .mutation(async ({ ctx, input }) => {
      const projectAvailability = await assertInAppAgentAvailable({
        ctx,
        projectId: input.projectId,
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
          trace_id: input.conversationId,
          observation_id: input.runId,
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

async function assertInAppAgentAvailable({
  ctx,
  projectId,
}: {
  ctx: {
    session: {
      user: NonNullable<Session["user"]>;
      environment: { enableExperimentalFeatures?: boolean };
    };
    prisma: PrismaClient;
  };
  projectId: string;
}) {
  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    throw new BaseError(
      "PreconditionFailedError",
      412,
      "In-app agent is not available in this environment yet.",
      true,
    );
  }

  const isInAppAgentEnabled =
    ctx.session.user.featureFlags.inAppAgent === true ||
    ctx.session.user.admin === true ||
    ctx.session.environment.enableExperimentalFeatures === true;

  if (!isInAppAgentEnabled) {
    throw new ForbiddenError("Assistant is not enabled for this user");
  }

  throwIfNoEntitlement({
    entitlement: "in-app-agent",
    sessionUser: ctx.session.user,
    projectId,
  });

  const project = await ctx.prisma.project.findUnique({
    where: { id: projectId },
    select: {
      organization: {
        select: {
          aiFeaturesEnabled: true,
          aiTelemetryEnabled: true,
        },
      },
    },
  });

  if (!project?.organization.aiFeaturesEnabled) {
    throw new ForbiddenError("Assistant is not enabled for this organization");
  }

  return {
    aiTelemetryEnabled: project.organization.aiTelemetryEnabled,
  };
}
