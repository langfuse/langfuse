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

  const slackService = SlackService.getInstance();
  const client = await slackService.getWebClientForProject(projectId);
  const access = await slackService.checkPrivateChannelAccess({
    client,
    channel: actionConfig.channelId,
    viewerSlackUserId: getPrivateChannelViewerSlackUserId(integration, userId),
  });

  if (access.isPrivate) {
    if (!access.hasAccess) throwChannelNotFound();
    return {
      ...actionConfig,
      channelId: access.channel.id,
      channelName: access.channel.name,
      isPrivate: true,
    };
  }

  // A typed #name can't be looked up without listing every channel; the test
  // message resolves it to an id.
  if (actionConfig.channelId.startsWith("#")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Send a test message to this channel before saving so it can be resolved.",
    });
  }

  const channel = await slackService.getChannelInfo(
    client,
    actionConfig.channelId,
  );
  if (!channel) throwChannelNotFound();
  return {
    ...actionConfig,
    channelId: channel.id,
    channelName: channel.name,
    isPrivate: false,
  };
}

function throwChannelNotFound(): never {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: SLACK_CHANNEL_NOT_FOUND_MESSAGE,
  });
}
