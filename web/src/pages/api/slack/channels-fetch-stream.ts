import type { NextApiRequest, NextApiResponse } from "next";
import * as z from "zod/v4";
import {
  SlackService,
  logger,
  type SlackChannelsFetchProgress,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { getServerAuthSession } from "@/src/server/auth";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";

type SSEEvent =
  | { type: "progress"; progress: SlackChannelsFetchProgress }
  | { type: "rate_limit"; retryAfterSeconds: number }
  | {
      type: "complete";
      data: {
        channels: {
          id: string;
          name: string;
          isPrivate: boolean;
          isMember: boolean;
        }[];
        teamId: string;
        teamName: string;
      };
    }
  | { type: "error"; message: string };

function formatSSEEvent(event: SSEEvent): string {
  switch (event.type) {
    case "progress":
      return `event: progress\ndata: ${JSON.stringify(event.progress)}\n\n`;
    case "rate_limit":
      return `event: rate_limit\ndata: ${JSON.stringify({
        retryAfterSeconds: event.retryAfterSeconds,
      })}\n\n`;
    case "complete":
      return `event: complete\ndata: ${JSON.stringify(event.data)}\n\n`;
    case "error":
      return `event: error\ndata: ${JSON.stringify({ message: event.message })}\n\n`;
  }
}

const inputSchema = z.object({
  projectId: z.string(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return;
  }

  const session = await getServerAuthSession({ req, res });
  if (!session?.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input", errors: parsed.error });
    return;
  }

  const { projectId } = parsed.data;

  if (
    !hasProjectAccess({
      session,
      projectId,
      scope: "automations:read",
    })
  ) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const integration = await prisma.slackIntegration.findUnique({
    where: { projectId },
  });

  if (!integration) {
    res
      .status(404)
      .json({ message: "Slack integration not found for this project" });
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { orgId: true },
  });

  if (!project) {
    res.status(404).json({ message: "Project not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  let aborted = false;
  req.on("close", () => {
    aborted = true;
  });

  try {
    const slackService = SlackService.getInstance();
    const client = await slackService.getWebClientForProject(projectId);

    const channels = await slackService.getChannels(client, {
      slackTeamId: integration.teamId,
      onProgress: (progress) => {
        if (!aborted) {
          res.write(formatSSEEvent({ type: "progress", progress }));
        }
      },
      onRateLimitBackoff: (retryAfterSeconds) => {
        if (!aborted) {
          res.write(formatSSEEvent({ type: "rate_limit", retryAfterSeconds }));
        }
      },
    });

    if (aborted) return;

    await auditLog({
      userId: session.user.id,
      orgId: project.orgId,
      resourceType: "slackIntegration",
      resourceId: integration.id,
      action: "read",
      after: { action: "channels_fetched", channelCount: channels.length },
    });

    res.write(
      formatSSEEvent({
        type: "complete",
        data: {
          channels,
          teamId: integration.teamId,
          teamName: integration.teamName,
        },
      }),
    );
  } catch (error) {
    if (!aborted) {
      logger.error("[channels-fetch-stream] Failed to fetch channels", {
        error,
        projectId,
      });
      const message =
        error instanceof Error ? error.message : "Failed to fetch channels";
      res.write(formatSSEEvent({ type: "error", message }));
    }
  } finally {
    res.end();
  }
}
