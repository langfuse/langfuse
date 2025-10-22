import { z } from "zod/v4";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { logger } from "@langfuse/shared/src/server";

// Currently only EMAIL and COMMENT_MENTION are supported
// Future channels: IN_APP, SLACK
// Future types: COMMENT_REPLY, COMMENT_NEW, EVAL_COMPLETE, EXPORT_READY
const NotificationChannelEnum = z.enum(["EMAIL"]);
const NotificationTypeEnum = z.enum(["COMMENT_MENTION"]);

const NotificationPreferenceInput = z.object({
  projectId: z.string(),
  channel: NotificationChannelEnum,
  type: NotificationTypeEnum,
  enabled: z.boolean(),
});

const GetPreferencesInput = z.object({
  projectId: z.string(),
});

export const notificationPreferencesRouter = createTRPCRouter({
  getForProject: protectedProjectProcedure
    .input(GetPreferencesInput)
    .query(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "project:read",
        });

        const userId = ctx.session.user.id;

        // Fetch all preferences for this user and project
        const preferences = await ctx.prisma.notificationPreference.findMany({
          where: {
            userId,
            projectId: input.projectId,
          },
        });

        // Create a map for quick lookup
        const preferencesMap = new Map(
          preferences.map((p) => [`${p.channel}:${p.type}`, p.enabled]),
        );

        // Return all possible combinations with defaults
        // For MVP, we only show EMAIL + COMMENT_MENTION, but structure supports future expansion
        const allPreferences = [
          {
            channel: "EMAIL" as const,
            type: "COMMENT_MENTION" as const,
            enabled:
              preferencesMap.get("EMAIL:COMMENT_MENTION") !== undefined
                ? preferencesMap.get("EMAIL:COMMENT_MENTION")!
                : true, // Default: enabled
          },
          // Future preferences can be added here
          // {
          //   channel: "EMAIL" as const,
          //   type: "COMMENT_REPLY" as const,
          //   enabled: preferencesMap.get("EMAIL:COMMENT_REPLY") ?? true,
          // },
        ];

        return allPreferences;
      } catch (error) {
        logger.error("Failed to fetch notification preferences", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch notification preferences.",
        });
      }
    }),

  update: protectedProjectProcedure
    .input(NotificationPreferenceInput)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "project:read",
        });

        const userId = ctx.session.user.id;

        // Upsert the preference
        const preference = await ctx.prisma.notificationPreference.upsert({
          where: {
            userId_projectId_channel_type: {
              userId,
              projectId: input.projectId,
              channel: input.channel,
              type: input.type,
            },
          },
          update: {
            enabled: input.enabled,
            updatedAt: new Date(),
          },
          create: {
            userId,
            projectId: input.projectId,
            channel: input.channel,
            type: input.type,
            enabled: input.enabled,
          },
        });

        logger.info(
          `Updated notification preference for user ${userId} in project ${input.projectId}: ${input.channel}:${input.type} = ${input.enabled}`,
        );

        return preference;
      } catch (error) {
        logger.error("Failed to update notification preference", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update notification preference.",
        });
      }
    }),
});
