import type { NextApiRequest, NextApiResponse } from "next";
import * as z from "zod/v4";
import { logger } from "@langfuse/shared/src/server";

import { getServerAuthSession } from "@/src/server/auth";
import { sendAdminAccessWebhook } from "@/src/server/adminAccessWebhook";
import { prisma } from "@langfuse/shared/src/db";
import { executeQuery } from "@langfuse/shared/query/server";
import {
  query as customQuery,
  validateQuery,
  viewVersions,
} from "@langfuse/shared/query";
export type SSEEvent =
  | { type: "progress"; progress: object }
  | { type: "row"; row: Record<string, unknown> }
  | { type: "done" }
  | { type: "error"; message: string };

function formatSSEEvent(event: SSEEvent): string {
  switch (event.type) {
    case "progress":
      return `event: progress\ndata: ${JSON.stringify(event.progress)}\n\n`;
    case "row":
      return `event: row\ndata: ${JSON.stringify(event.row)}\n\n`;
    case "done":
      return `event: done\ndata: {}\n\n`;
    case "error":
      return `event: error\ndata: ${JSON.stringify({ message: event.message })}\n\n`;
  }
}

const inputSchema = z.object({
  projectId: z.string(),
  query: customQuery,
  version: viewVersions.optional().default("v1"),
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

  const { projectId, query, version } = parsed.data;

  // Verify user is a member of this project (mirrors enforceUserIsAuthedAndProjectMember)
  const sessionProject = session.user.organizations
    .flatMap((org) =>
      org.projects.map((project) => ({ ...project, organization: org })),
    )
    .find((project) => project.id === projectId);

  if (!sessionProject) {
    if (session.user.admin === true) {
      const dbProject = await prisma.project.findFirst({
        select: { orgId: true },
        where: { id: projectId, deletedAt: null },
      });
      if (!dbProject) {
        res.status(404).json({ message: "Project not found" });
        return;
      }
      await sendAdminAccessWebhook({
        email: session.user.email,
        projectId,
        orgId: dbProject.orgId,
      });
    } else {
      res.status(403).json({ message: "Not a member of this project" });
      return;
    }
  } else if (session.user.admin === true) {
    await sendAdminAccessWebhook({
      email: session.user.email,
      projectId,
      orgId: sessionProject.organization.id,
    });
  }

  if (session.user.v4BetaEnabled !== true) {
    res.status(400).json({
      message: "Streaming is only supported for v4-enabled dashboard queries",
    });
    return;
  }

  const validation = validateQuery(query, version);
  if (!validation.valid) {
    res.status(400).json({ message: "Invalid query", errors: validation });
    return;
  }

  // SSE headers
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
    // GreptimeDB engine (04-read-path.md, P3): the dashboard query engine no longer streams partial
    // progress. We run the buffered GreptimeDB query and emit the rows followed by `done` over the
    // same SSE contract — the client renders the final result without intermediate `progress` events.
    const rows = await executeQuery(projectId, query, version);
    for (const row of rows) {
      if (aborted) break;
      res.write(formatSSEEvent({ type: "row", row }));
    }
    if (!aborted) {
      res.write(formatSSEEvent({ type: "done" }));
    }
  } catch (error) {
    if (!aborted) {
      logger.error("[execute-query-stream] Query failed", {
        error: error instanceof Error ? error.message : String(error),
        projectId,
      });
      const message =
        error instanceof Error ? error.message : "Internal server error";
      res.write(formatSSEEvent({ type: "error", message }));
    }
  } finally {
    res.end();
  }
}
