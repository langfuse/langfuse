import {
  type ActionCreate,
  type ActionDomain,
  type SlackActionConfig,
  isSlackActionConfig,
} from "@langfuse/shared";
import {
  SLACK_CHANNEL_NOT_FOUND_MESSAGE,
  SlackService,
  getPrivateChannelViewerSlackUserId,
  getViewablePrivateSlackChannelIds,
  maskPrivateSlackChannel,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";

/**
 * processSlackActionConfig resolves the target channel to an id and records
 * whether it is private. Channels that don't exist and private channels the
 * user may not use fail identically, so saving can't reveal a private channel.
 */
export async function processSlackActionConfig({
  actionConfig,
  existingActionConfig,
  projectId,
  userId,
}: {
  actionConfig: ActionCreate;
  existingActionConfig?: ActionDomain["config"];
  projectId: string;
  userId: string;
}): Promise<SlackActionConfig> {
  if (actionConfig.type !== "SLACK") {
    throw new Error("Action type is not SLACK");
  }

  const integration = await prisma.slackIntegration.findUnique({
    where: { projectId },
  });
  if (!integration) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message:
        "Slack integration not found. Please connect your Slack workspace first.",
    });
  }

  // Keep the stored channel fields so a masked name is never written back.
  if (
    isSlackActionConfig(existingActionConfig) &&
    existingActionConfig.channelId === actionConfig.channelId
  ) {
    return {
      ...actionConfig,
      channelName: existingActionConfig.channelName,
      isPrivate: existingActionConfig.isPrivate,
    };
  }

  // Rejected before any lookup so the response can't differ between private and
  // missing channels; the test message resolves a typed #name to an id.
  if (actionConfig.channelId.startsWith("#")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Send a test message to this channel before saving so it can be resolved.",
    });
  }

  const slackService = SlackService.getInstance();
  const client = await slackService.getWebClientForProject(projectId);
  const access = await slackService.checkPrivateChannelAccess({
    client,
    channel: actionConfig.channelId,
    viewerSlackUserId: getPrivateChannelViewerSlackUserId(integration, userId),
  });

  if (access.access === "denied") throwChannelNotFound();
  if (access.access === "private") {
    return {
      ...actionConfig,
      channelId: access.channel.id,
      channelName: access.channel.name,
      isPrivate: true,
    };
  }

  const channel = await slackService.getChannelInfo(
    client,
    actionConfig.channelId,
  );
  // A private result here is one the access check didn't vouch for.
  if (!channel || channel.isPrivate) throwChannelNotFound();
  return {
    ...actionConfig,
    channelId: channel.id,
    channelName: channel.name,
    isPrivate: false,
  };
}

/** maskActionForViewer masks a saved private channel name the user may not see. */
export async function maskActionForViewer<T extends { config: unknown }>({
  action,
  projectId,
  userId,
}: {
  action: T;
  projectId: string;
  userId: string;
}) {
  return maskPrivateSlackChannel(
    action,
    await getViewablePrivateSlackChannelIds({
      projectId,
      userId,
      actions: [action],
    }),
  );
}

function throwChannelNotFound(): never {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: SLACK_CHANNEL_NOT_FOUND_MESSAGE,
  });
}
