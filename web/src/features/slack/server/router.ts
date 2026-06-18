import {
  createTRPCRouter,
  authenticatedProcedure,
  protectedProcedureWithoutTracing,
  protectedProjectProcedure,
  protectedProjectProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import { z } from "zod";
import { SlackService, SlackApiError } from "@langfuse/shared/src/server";
import {
  hasProjectAccess,
  throwIfNoProjectAccess,
} from "@/src/features/rbac/utils/checkProjectAccess";
import { logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { env } from "@/src/env.mjs";
import { readPendingInstallClaimCookie } from "@/src/features/slack/server/pendingInstallClaimCookie";

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
        const { channels, hasPrivateChannelAccess } =
          await slackService.getChannels(client);

        await auditLog({
          session: ctx.session,
          resourceType: "slackIntegration",
          resourceId: integration.id,
          action: "read",
          after: { action: "channels_fetched", channelCount: channels.length },
        });

        return {
          channels,
          hasPrivateChannelAccess,
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
        // Slack resolves both channel IDs (C1234) and names (#general)
        channelId: z.string(),
        channelName: z.string().optional(),
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
                text: `*Channel:*\n#${input.channelName ?? input.channelId.replace(/^#/, "")}`,
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

        // For manually-typed channel names (id starts with #), resolve
        // channel metadata via conversations.info so the UI can show
        // accurate type/ID info. Skip for channels already selected from
        // the list since we already have their metadata.
        let channelInfo: {
          id: string;
          name?: string;
          isPrivate?: boolean;
        } = { id: result.channel };

        if (input.channelId.startsWith("#")) {
          const resolved = await SlackService.getInstance().getChannelInfo(
            client,
            result.channel,
          );
          if (resolved) {
            channelInfo = {
              id: resolved.id,
              name: resolved.name,
              isPrivate: resolved.isPrivate,
            };
          }
        }

        await auditLog({
          session: ctx.session,
          resourceType: "slackIntegration",
          resourceId: integration.id,
          action: "create",
          after: {
            action: "test_message_sent",
            channelId: result.channel,
            channelName: input.channelName,
            messageTs: result.messageTs,
          },
        });

        logger.info("Test message sent successfully", {
          projectId: input.projectId,
          channelId: result.channel,
          channelName: input.channelName,
          messageTs: result.messageTs,
        });

        return {
          success: true,
          messageTs: result.messageTs,
          channel: result.channel,
          channelInfo,
        };
      } catch (error) {
        logger.error("Failed to send test message", {
          error,
          projectId: input.projectId,
          channelId: input.channelId,
        });

        const slackError =
          error instanceof SlackApiError ? error.slackErrorCode : undefined;

        const userMessage = (() => {
          switch (slackError) {
            case "channel_not_found":
              return 'Channel not found. The channel may not exist or is a private channel the bot has not been invited to. For private channels, invite the app with "/invite @Langfuse" in that channel.';
            case "not_in_channel":
              return "The bot is not a member of this channel. Please invite the bot to the channel first.";
            case "is_archived":
              return "This channel has been archived and cannot receive messages.";
            case "invalid_auth":
            case "token_revoked":
              return "Slack authentication failed. Please reconnect your Slack workspace.";
            default:
              return "Failed to send test message. Please check your Slack connection and channel permissions.";
          }
        })();

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: userMessage,
        });
      }
    }),

  /**
   * Get the pending (unlinked) Marketplace installation for a Slack workspace.
   * Used by the /slack/direct-setup onboarding page to show which workspace is being
   * linked. Authenticated but not project-scoped: the install isn't owned by a
   * project yet. Returns null if there is no pending install or it has expired.
   */
  // The claim is a bearer token for a live bot token: it is delivered as an
  // httpOnly cookie (never a URL param or tRPC input) and read server-side
  // here. Non-traced so the cookie-derived claim never reaches input telemetry.
  getPendingInstallation: protectedProcedureWithoutTracing
    .input(z.object({ teamId: z.string() }))
    .query(async ({ input, ctx }) => {
      const claim = readPendingInstallClaimCookie(
        ctx.headers.cookie,
        input.teamId,
      );
      const pending = claim
        ? await SlackService.getInstance().getClaimedPendingInstallation(
            input.teamId,
            claim,
          )
        : null;

      return {
        isPending: pending !== null,
        teamId: pending?.teamId ?? null,
        teamName: pending?.teamName ?? null,
      };
    }),

  /**
   * Drives the /slack/direct-setup onboarding page: the user's projects grouped by
   * organization, limited to those the user can configure automations on (the
   * same scope linkPendingInstallation enforces), each flagged with whether
   * Slack is already connected. Scoped to the user's own session, so it never
   * leaks other tenants' projects or connection status.
   */
  getConnectableProjects: authenticatedProcedure.query(async ({ ctx }) => {
    const orgs = (ctx.session.user?.organizations ?? [])
      .map((org) => ({
        orgId: org.id,
        orgName: org.name,
        projects: org.projects.filter(
          (project) =>
            !project.deletedAt &&
            hasProjectAccess({
              session: ctx.session,
              projectId: project.id,
              scope: "automations:CUD",
            }),
        ),
      }))
      .filter((org) => org.projects.length > 0);

    const projectIds = orgs.flatMap((org) =>
      org.projects.map((project) => project.id),
    );
    if (projectIds.length === 0) return [];

    const connectedRows = await ctx.prisma.slackIntegration.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true },
    });
    const connectedSet = new Set(connectedRows.map((row) => row.projectId));

    return orgs.map((org) => ({
      orgId: org.orgId,
      orgName: org.orgName,
      projects: org.projects.map((project) => ({
        projectId: project.id,
        projectName: project.name,
        isConnected: connectedSet.has(project.id),
      })),
    }));
  }),

  /**
   * Link a pending Marketplace installation to a project. Requires
   * automations:CUD on the chosen project. Moves the pending install in place;
   * replaces any existing integration for the project.
   */
  // The claim arrives as an httpOnly cookie (see getPendingInstallation), read
  // server-side — never a tRPC input. Non-traced for the same reason.
  linkPendingInstallation: protectedProjectProcedureWithoutTracing
    .input(
      z.object({
        projectId: z.string(),
        teamId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      const claim = readPendingInstallClaimCookie(
        ctx.headers.cookie,
        input.teamId,
      );
      const linked = claim
        ? await SlackService.getInstance().linkPendingInstallation(
            input.teamId,
            input.projectId,
            claim,
          )
        : null;

      if (!linked) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "This Slack installation has expired or was not found. Please reinstall the app from Slack.",
        });
      }

      await auditLog({
        session: ctx.session,
        resourceType: "slackIntegration",
        resourceId: linked.id,
        action: "create",
        after: {
          teamId: linked.teamId,
          teamName: linked.teamName,
          linkedFromMarketplace: true,
        },
      });

      logger.info("Linked pending Slack installation to project", {
        projectId: input.projectId,
        teamId: linked.teamId,
      });

      return {
        success: true,
        teamId: linked.teamId,
        teamName: linked.teamName,
      };
    }),
});
