import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { z } from "zod/v4";
import { SlackService } from "@langfuse/shared/src/server";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { env } from "@/src/env.mjs";

export const slackRouter = createTRPCRouter({
  /**
   * Get Slack integration status for a project
   */
  getIntegrationStatus: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:read",
      });

      const integration = await ctx.prisma.slackIntegration.findUnique({
        where: { projectId: input.projectId },
      });

      if (!integration) {
        return {
          isConnected: false,
          teamId: null,
          teamName: null,
          installUrl: `/api/public/slack/install?projectId=${input.projectId}`,
        };
      }

      try {
        const slackService = SlackService.getInstance();
        const client = await slackService.getWebClientForProject(
          input.projectId,
        );
        const isValid = await slackService.validateClient(client);

        if (!isValid) {
          logger.warn("Invalid Slack integration found", {
            projectId: input.projectId,
            teamId: integration.teamId,
          });

          return {
            isConnected: false,
            teamId: integration.teamId,
            teamName: integration.teamName,
            installUrl: `/api/public/slack/install?projectId=${input.projectId}`,
            error:
              "Integration is invalid. Please reconnect your Slack workspace.",
          };
        }

        return {
          isConnected: true,
          teamId: integration.teamId,
          teamName: integration.teamName,
          botUserId: integration.botUserId,
          installUrl: null,
        };
      } catch (error) {
        logger.warn("Failed to validate Slack integration", {
          projectId: input.projectId,
          teamId: integration.teamId,
          error,
        });

        return {
          isConnected: false,
          teamId: integration.teamId,
          teamName: integration.teamName,
          installUrl: `/api/public/slack/install?projectId=${input.projectId}`,
          error:
            "Failed to validate integration. Please reconnect your Slack workspace.",
        };
      }
    }),

  /**
   * Get channels for a project's Slack integration
   */
  getChannels: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:read",
      });

      const integration = await ctx.prisma.slackIntegration.findUnique({
        where: { projectId: input.projectId },
      });

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Slack integration not found for this project",
        });
      }

      try {
        const slackService = SlackService.getInstance();
        const client = await slackService.getWebClientForProject(
          input.projectId,
        );
        const channels = await slackService.getChannels(client);

        await auditLog({
          session: ctx.session,
          resourceType: "slackIntegration",
          resourceId: integration.id,
          action: "read",
          after: { action: "channels_fetched", channelCount: channels.length },
        });

        return {
          channels,
          teamId: integration.teamId,
          teamName: integration.teamName,
        };
      } catch (error) {
        logger.error("Failed to fetch channels", {
          error,
          projectId: input.projectId,
        });

        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Failed to fetch channels. Please check your Slack connection and try again.",
        });
      }
    }),

  /**
   * Disconnect Slack integration for a project
   */
  disconnect: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      const integration = await ctx.prisma.slackIntegration.findUnique({
        where: { projectId: input.projectId },
      });

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Slack integration not found for this project",
        });
      }

      try {
        await SlackService.getInstance().deleteIntegration(input.projectId);

        await auditLog({
          session: ctx.session,
          resourceType: "slackIntegration",
          resourceId: integration.id,
          action: "delete",
          before: integration,
        });

        logger.info("Slack integration disconnected", {
          projectId: input.projectId,
          teamId: integration.teamId,
        });

        return { success: true };
      } catch (error) {
        logger.error("Failed to disconnect Slack integration", {
          error,
          projectId: input.projectId,
        });

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to disconnect Slack integration. Please try again.",
        });
      }
    }),

  /**
   * Send a test message to a Slack channel
   */
  sendTestMessage: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        channelId: z.string(),
        channelName: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      const integration = await ctx.prisma.slackIntegration.findUnique({
        where: { projectId: input.projectId },
      });

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Slack integration not found for this project",
        });
      }

      try {
        const client = await SlackService.getInstance().getWebClientForProject(
          input.projectId,
        );

        const testBlocks = [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "🎉 Test Message from Langfuse",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Hello from Langfuse! This is a test message to verify your Slack integration is working properly.",
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Project:*\n${input.projectId}`,
              },
              {
                type: "mrkdwn",
                text: `*Channel:*\n#${input.channelName}`,
              },
              {
                type: "mrkdwn",
                text: `*User:*\n${ctx.session.user.name || ctx.session.user.email}`,
              },
              {
                type: "mrkdwn",
                text: `*Time:*\n${new Date().toISOString()}`,
              },
            ],
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Open Langfuse",
                  emoji: true,
                },
                url: `${env.NEXTAUTH_URL}/project/${input.projectId}`,
                style: "primary",
              },
            ],
          },
        ];

        const result = await SlackService.getInstance().sendMessage({
          client,
          channelId: input.channelId,
          blocks: testBlocks,
          text: "Test message from Langfuse",
        });

        await auditLog({
          session: ctx.session,
          resourceType: "slackIntegration",
          resourceId: integration.id,
          action: "create",
          after: {
            action: "test_message_sent",
            channelId: input.channelId,
            channelName: input.channelName,
            messageTs: result.messageTs,
          },
        });

        logger.info("Test message sent successfully", {
          projectId: input.projectId,
          channelId: input.channelId,
          channelName: input.channelName,
          messageTs: result.messageTs,
        });

        return {
          success: true,
          messageTs: result.messageTs,
          channel: result.channel,
        };
      } catch (error) {
        logger.error("Failed to send test message", {
          error,
          projectId: input.projectId,
          channelId: input.channelId,
        });

        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Failed to send test message. Please check your Slack connection and channel permissions.",
        });
      }
    }),
});
