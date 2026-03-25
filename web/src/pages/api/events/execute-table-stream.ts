import type { NextApiRequest, NextApiResponse } from "next";
import superjson from "superjson";
import { paginationZod } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  ClickHouseResourceError,
  buildObservationsFromEventsTableQuery,
  hydrateObservationsWithModelDataFromEventsTableRows,
  isException,
  isProgressRow,
  isRow,
  logger,
  queryClickhouseWithProgress,
} from "@langfuse/shared/src/server";
import type { EventsTableObservationListRow } from "@langfuse/shared/src/server";
import { RESOURCE_LIMIT_ERROR_MESSAGE } from "@langfuse/shared";

import { getServerAuthSession } from "@/src/server/auth";
import { sendAdminAccessWebhook } from "@/src/server/adminAccessWebhook";
import { EventsTableOptions } from "@/src/features/events/server/types";
import {
  buildEventListQueryOptions,
  hydrateEventListObservations,
} from "@/src/features/events/server/eventsService";

type StreamingErrorKind = "resource_limit" | "generic";

type SSEEvent =
  | { type: "progress"; progress: object }
  | { type: "result"; result: unknown }
  | { type: "done" }
  | { type: "error"; kind: StreamingErrorKind; message: string };

function formatSSEEvent(event: SSEEvent): string {
  switch (event.type) {
    case "progress":
      return `event: progress\ndata: ${JSON.stringify(event.progress)}\n\n`;
    case "result":
      return `event: result\ndata: ${JSON.stringify(superjson.serialize(event.result))}\n\n`;
    case "done":
      return "event: done\ndata: {}\n\n";
    case "error":
      return `event: error\ndata: ${JSON.stringify({ kind: event.kind, message: event.message })}\n\n`;
  }
}

const inputSchema = EventsTableOptions.extend({
  ...paginationZod,
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

  const { projectId, filter, searchQuery, searchType, orderBy, page, limit } =
    parsed.data;

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
      message:
        "Streaming is only supported for v4-enabled traces table queries",
    });
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
    const queryOpts = buildEventListQueryOptions({
      projectId,
      filter,
      searchQuery: searchQuery ?? undefined,
      searchType,
      orderBy,
      page,
      limit,
    });
    const { query, params } = buildObservationsFromEventsTableQuery({
      ...queryOpts,
      select: "rows",
    });
    const rows: EventsTableObservationListRow[] = [];

    for await (const event of queryClickhouseWithProgress<EventsTableObservationListRow>(
      {
        query,
        params,
        tags: {
          feature: "tracing",
          type: "events",
          kind: "list-stream",
          projectId,
          operation_name: "getObservationsTableStream",
        },
        preferredClickhouseService: "EventsReadOnly",
      },
    )) {
      if (aborted) break;

      if (isProgressRow(event)) {
        res.write(
          formatSSEEvent({ type: "progress", progress: event.progress }),
        );
        continue;
      }

      if (isRow<EventsTableObservationListRow>(event)) {
        rows.push(event.row);
        continue;
      }

      if (isException(event)) {
        const wrappedError = ClickHouseResourceError.wrapIfResourceError(
          new Error(event.exception),
        );
        const isResourceError = wrappedError instanceof ClickHouseResourceError;
        res.write(
          formatSSEEvent({
            type: "error",
            kind: isResourceError ? "resource_limit" : "generic",
            message: isResourceError
              ? RESOURCE_LIMIT_ERROR_MESSAGE
              : event.exception,
          }),
        );
        return;
      }
    }

    if (!aborted) {
      const hydratedRows =
        await hydrateObservationsWithModelDataFromEventsTableRows(
          rows,
          queryOpts,
        );
      const result = await hydrateEventListObservations({
        projectId,
        observations: hydratedRows,
      });

      res.write(formatSSEEvent({ type: "result", result }));
      res.write(formatSSEEvent({ type: "done" }));
    }
  } catch (error) {
    if (!aborted) {
      logger.error("[execute-events-table-stream] Query failed", {
        error: error instanceof Error ? error.message : String(error),
        projectId,
      });

      const wrappedError =
        error instanceof ClickHouseResourceError
          ? error
          : ClickHouseResourceError.wrapIfResourceError(
              error instanceof Error ? error : new Error(String(error)),
            );
      const isResourceError = wrappedError instanceof ClickHouseResourceError;

      res.write(
        formatSSEEvent({
          type: "error",
          kind: isResourceError ? "resource_limit" : "generic",
          message: isResourceError
            ? RESOURCE_LIMIT_ERROR_MESSAGE
            : wrappedError instanceof Error
              ? wrappedError.message
              : "Internal server error",
        }),
      );
    }
  } finally {
    res.end();
  }
}
