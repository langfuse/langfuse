import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedProjectProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import { AgUiMessageSchema } from "@/src/features/in-app-agent/schema";
import {
  getOwnedConversationOrThrow,
  serializeConversation,
  serializeMessage,
  upsertConversationMessages,
} from "@/src/features/in-app-agent/server/persistence";
import type { PrismaClient } from "@langfuse/shared/src/db";

const ConversationIdInput = z.object({
  projectId: z.string(),
  conversationId: z.string(),
});

export const inAppAgentRouter = createTRPCRouter({
  list: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertInAppAgentAvailable({ ctx, projectId: input.projectId });

      const conversations = await ctx.prisma.inAppAgentConversation.findMany({
        where: {
          projectId: input.projectId,
          createdByUserId: ctx.session.user.id,
          deletedAt: null,
        },
        orderBy: [
          { lastMessageAt: { sort: "desc", nulls: "last" } },
          { updatedAt: "desc" },
        ],
        take: 50,
      });

      return conversations.map(serializeConversation);
    }),

  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertInAppAgentAvailable({ ctx, projectId: input.projectId });

      const conversation = await ctx.prisma.inAppAgentConversation.create({
        data: {
          projectId: input.projectId,
          createdByUserId: ctx.session.user.id,
        },
      });

      return serializeConversation(conversation);
    }),

  get: protectedProjectProcedureWithoutTracing
    .input(ConversationIdInput)
    .query(async ({ ctx, input }) => {
      await assertInAppAgentAvailable({ ctx, projectId: input.projectId });

      const conversation = await getOwnedConversationOrThrow({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: ctx.session.user.id,
      });

      const messages = await ctx.prisma.inAppAgentMessage.findMany({
        where: {
          projectId: input.projectId,
          conversationId: input.conversationId,
        },
        orderBy: [{ sequenceNumber: "asc" }, { createdAt: "asc" }],
      });

      return {
        conversation: serializeConversation(conversation),
        messages: messages.flatMap((message) => {
          const serialized = serializeMessage(message);
          return serialized ? [serialized] : [];
        }),
        state: {
          type: "existingConversation" as const,
          projectId: input.projectId,
          conversationId: input.conversationId,
        },
      };
    }),

  syncMessages: protectedProjectProcedureWithoutTracing
    .input(
      ConversationIdInput.extend({
        messages: z.array(AgUiMessageSchema).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertInAppAgentAvailable({ ctx, projectId: input.projectId });
      await getOwnedConversationOrThrow({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: ctx.session.user.id,
      });

      await upsertConversationMessages({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: ctx.session.user.id,
        messages: input.messages,
      });

      return { ok: true };
    }),
});

async function assertInAppAgentAvailable({
  ctx,
  projectId,
}: {
  ctx: {
    session: {
      user: {
        admin?: boolean;
        featureFlags: { inAppAgent?: boolean };
      };
      environment: { enableExperimentalFeatures?: boolean };
    };
    prisma: PrismaClient;
  };
  projectId: string;
}) {
  const isInAppAgentEnabled =
    ctx.session.user.featureFlags.inAppAgent === true ||
    ctx.session.user.admin === true ||
    ctx.session.environment.enableExperimentalFeatures === true;

  if (!isInAppAgentEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Assistant is not enabled for this user",
    });
  }

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
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Assistant is not enabled for this organization",
    });
  }
}
