import { z } from "zod";

import { ForbiddenError } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedProjectProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import {
  getConversationEvents,
  getOwnedConversationOrThrow,
  reduceEventsToMessages,
  serializeConversation,
} from "@/src/features/in-app-agent/server/persistence";

const CONVERSATION_LIST_LIMIT = 50;
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const ConversationListCursorSchema = z.object({
  updatedAt: z.date(),
  id: z.string(),
});

const ConversationIdInput = z.object({
  projectId: z.string(),
  conversationId: z.string(),
});

export const inAppAgentRouter = createTRPCRouter({
  list: protectedProjectProcedure
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
          // TODO: we want to auto-generate titles based on content later
          title: getDefaultConversationTitle(new Date()),
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

      const events = await getConversationEvents({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
      });

      return {
        conversation: serializeConversation(conversation),
        messages: reduceEventsToMessages(events),
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
    throw new ForbiddenError("Assistant is not enabled for this user");
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
    throw new ForbiddenError("Assistant is not enabled for this organization");
  }
}

function getDefaultConversationTitle(date: Date) {
  const weekday = WEEKDAY_NAMES[date.getDay()] ?? "Unknown";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `Chat on ${weekday} at ${hours}:${minutes}`;
}
