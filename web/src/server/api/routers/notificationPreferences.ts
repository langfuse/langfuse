import { z } from "zod/v4";
import { NotificationChannel, NotificationType } from "@prisma/client";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { auditLog } from "@/src/features/audit-logs/auditLog";

// Use enums from Prisma types to stay in sync with DB schema
const NotificationChannelEnum = z.enum(NotificationChannel);
const NotificationTypeEnum = z.enum(NotificationType);

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
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:read",
      });

      const userId = ctx.session.user.id;

      // Fetch the EMAIL + COMMENT_MENTION preference
      const preference = await ctx.prisma.notificationPreference.findUnique({
        where: {
          userId_projectId_channel_type: {
            userId,
            projectId: input.projectId,
            channel: "EMAIL",
            type: "COMMENT_MENTION",
          },
        },
      });

      // Return as array to maintain consistent API shape for future expansion
      const allPreferences = [
        {
          channel: "EMAIL" as const,
          type: "COMMENT_MENTION" as const,
          enabled: preference?.enabled ?? true, // Default: enabled
        },
      ];

      return allPreferences;
    }),

  update: protectedProjectProcedure
    .input(NotificationPreferenceInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:read",
      });

      const userId = ctx.session.user.id;

      // Fetch existing preference for audit log
      const before = await ctx.prisma.notificationPreference.findUnique({
        where: {
          userId_projectId_channel_type: {
            userId,
            projectId: input.projectId,
            channel: input.channel,
            type: input.type,
          },
        },
      });

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
        },
        create: {
          userId,
          projectId: input.projectId,
          channel: input.channel,
          type: input.type,
          enabled: input.enabled,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "notificationPreference",
        resourceId: preference.id,
        action: before ? "update" : "create",
        before: before ?? undefined,
        after: preference,
      });

      return preference;
    }),
});
