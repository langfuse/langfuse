import { once } from "node:events";
import type { NextApiRequest, NextApiResponse } from "next";
import * as z from "zod/v4";
import {
  isProgressRow,
  isRow,
  isException,
  ClickHouseResourceError,
  queryClickhouseWithProgress,
  logger,
} from "@langfuse/shared/src/server";

import { getServerAuthSession } from "@/src/server/auth";
import { sendAdminAccessWebhook } from "@/src/server/adminAccessWebhook";
import {
  prepareExecuteQuery,
  toClickhouseQueryOpts,
} from "@langfuse/shared/query/server";
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

async function writeSSEEvent(
  res: NextApiResponse,
  event: SSEEvent,
  clientClosed: AbortSignal,
): Promise<boolean> {
  if (clientClosed.aborted) {
    return false;
  }

  if (res.write(formatSSEEvent(event))) {
    return true;
  }

  try {
    await once(res, "drain", { signal: clientClosed });
    return !clientClosed.aborted;
  } catch (error) {
    if (clientClosed.aborted) {
      return false;
    }
    throw error;
  }
}

// `version` is required on purpose — see dashboard.executeQuery: an implicit
// v1 default let unresolved-session clients silently pick the read path.
const inputSchema = z.object({
  projectId: z.string(),
  query: customQuery,
  version: viewVersions,
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
    res.status(403).json({ message: "Not a member of this project" });
    return;
  }

  if (sessionProject.organization.supportAccess === true) {
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

  // A closed client should also stop the ClickHouse query, not just this
  // response: aborting the signal tears down the CH request (and counts the
  // query as client_closed), and cancel_http_readonly_queries_on_client_close
  // makes ClickHouse kill the query on that close instead of running the
  // abandoned aggregation to completion. max_execution_time still bounds the
  // stragglers either way.
  const clientClosed = new AbortController();
  // `res`, not `req`: the request stream can end once the POST body is
  // consumed, while the response lives for the whole stream — its close
  // fires on a client disconnect mid-stream (and only after res.end() on
  // the happy path, where the loop has already finished).
  const onClientClosed = () => clientClosed.abort();
  res.on("close", onClientClosed);

  try {
    const prepared = await prepareExecuteQuery({
      projectId,
      query,
      version,
      enableSingleLevelOptimization: version === "v2",
    });
    const chOpts = toClickhouseQueryOpts(prepared);

    for await (const event of queryClickhouseWithProgress<
      Record<string, unknown>
    >({
      ...chOpts,
      abortSignal: clientClosed.signal,
      tags: {
        ...chOpts.tags,
        surface: "internalapi",
        route: "POST /api/dashboard/execute-query-stream",
      },
      clickhouseSettings: {
        ...chOpts.clickhouseSettings,
        cancel_http_readonly_queries_on_client_close: 1,
      },
    })) {
      if (isProgressRow(event)) {
        if (
          !(await writeSSEEvent(
            res,
            { type: "progress", progress: event.progress },
            clientClosed.signal,
          ))
        ) {
          break;
        }
      } else if (isRow<Record<string, unknown>>(event)) {
        if (
          !(await writeSSEEvent(
            res,
            { type: "row", row: event.row },
            clientClosed.signal,
          ))
        ) {
          break;
        }
      } else if (isException(event)) {
        const exception = ClickHouseResourceError.wrapIfResourceError(
          new Error(event.exception),
        );
        logger.error(
          `[execute-query-stream] ClickHouse exception: ${event.exception}`,
          { projectId },
        );
        const userMessage =
          exception instanceof ClickHouseResourceError
            ? exception.adviceMessage
            : event.exception;
        await writeSSEEvent(
          res,
          { type: "error", message: userMessage },
          clientClosed.signal,
        );
        return;
      }
    }

    if (!clientClosed.signal.aborted) {
      await writeSSEEvent(res, { type: "done" }, clientClosed.signal);
    }
  } catch (error) {
    if (!clientClosed.signal.aborted) {
      logger.error("[execute-query-stream] Query failed", {
        error: error instanceof Error ? error.message : String(error),
        projectId,
      });
      const message = (() => {
        if (error instanceof ClickHouseResourceError) {
          return error.adviceMessage;
        }
        if (error instanceof Error) {
          return error.message;
        }
        return "Internal server error";
      })();
      await writeSSEEvent(res, { type: "error", message }, clientClosed.signal);
    }
  } finally {
    try {
      res.end();
    } finally {
      res.removeListener("close", onClientClosed);
    }
  }
}
