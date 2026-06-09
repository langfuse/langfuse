import { z } from "zod";
import type { Session } from "next-auth";

import { BaseError, ForbiddenError } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";
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
        },
      },
    },
  });

  if (!project?.organization.aiFeaturesEnabled) {
    throw new ForbiddenError("Assistant is not enabled for this organization");
  }
}
