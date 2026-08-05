import { EventType } from "@ag-ui/core";

import { InAppAgentRunStatusSchema } from "../../index";
import { Prisma, type PrismaClient } from "../../db";
import {
  isActiveInAppAgentRunStatus,
  type InAppAgentWatchFrame,
} from "../backgroundWatch";
import type { AgUiEvent } from "../schema";
import {
  IN_APP_AGENT_WATCH_KEEPALIVE_MS,
  IN_APP_AGENT_WATCH_MAX_CONNECTION_MS,
  IN_APP_AGENT_WATCH_TAIL_POLL_MS,
} from "./tunables";

/**
 * Tail persisted events while preserving AG-UI run framing. Synthetic frames
 * never advance beyond the event they frame, so reconnect cannot skip a row.
 * `null` asks the SSE transport to emit a keep-alive comment.
 *
 * A pure reader: it holds no lifecycle authority and writes nothing. Stale runs
 * are terminalized by the worker's lifecycle sweep, by snapshot hydration, and
 * by the next submit. A watch attached to a run whose worker died therefore
 * sees `done` once the sweep gets to it, not because the watch went looking.
 */
export async function* watchConversationFrames(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  cursor: number;
  signal?: AbortSignal;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): AsyncGenerator<InAppAgentWatchFrame | null> {
  const now = params.now ?? (() => Date.now());
  const sleep =
    params.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const startedAt = now();
  let cursor = params.cursor;
  let lastKeepaliveAt = startedAt;
  let openRunId: string | null = null;
  let lastStatusKey: string | null = null;

  while (!params.signal?.aborted) {
    // Read status first: terminal CAS happens after the worker appends events.
    const { latestRun, events } = await params.prisma.$transaction(
      async (tx) => ({
        latestRun: await tx.inAppAgentRun.findFirst({
          where: {
            projectId: params.projectId,
            conversationId: params.conversationId,
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            errorCode: true,
            cancelRequestedAt: true,
          },
        }),
        events: await tx.inAppAgentEvent.findMany({
          where: {
            projectId: params.projectId,
            conversationId: params.conversationId,
            sequenceNumber: { gt: cursor },
          },
          orderBy: { sequenceNumber: "asc" },
          select: { sequenceNumber: true, runId: true, event: true },
        }),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    for (const row of events) {
      const event = row.event as unknown as AgUiEvent;

      if (openRunId !== row.runId) {
        if (openRunId) {
          yield syntheticFrame(row.sequenceNumber - 1, {
            type: EventType.RUN_FINISHED,
            threadId: params.conversationId,
            runId: openRunId,
          });
        }

        if (event.type !== EventType.RUN_STARTED) {
          yield syntheticFrame(row.sequenceNumber - 1, {
            type: EventType.RUN_STARTED,
            threadId: params.conversationId,
            runId: row.runId,
          });
        }

        openRunId = row.runId;
      }

      yield {
        type: "event",
        sequenceNumber: row.sequenceNumber,
        event: toPublicEvent(event),
      };

      if (
        event.type === EventType.RUN_FINISHED ||
        event.type === EventType.RUN_ERROR
      ) {
        openRunId = null;
      }

      cursor = row.sequenceNumber;
    }

    // Legacy rows may have no status and cannot be watched as active runs.
    if (!latestRun) {
      yield { type: "done" };
      return;
    }

    const parsedStatus = InAppAgentRunStatusSchema.safeParse(latestRun.status);
    if (!parsedStatus.success) {
      yield { type: "done" };
      return;
    }

    const status = parsedStatus.data;
    const cancelRequested = Boolean(latestRun.cancelRequestedAt);
    const statusKey = `${latestRun.id}:${status}:${cancelRequested}`;

    if (statusKey !== lastStatusKey) {
      lastStatusKey = statusKey;
      yield {
        type: "status",
        runId: latestRun.id,
        status,
        errorCode: latestRun.errorCode,
        cancelRequested,
      };
    }

    if (!isActiveInAppAgentRunStatus(status)) {
      // Close runs that terminated without persisting RUN_FINISHED.
      if (openRunId) {
        yield syntheticFrame(cursor, {
          type: EventType.RUN_FINISHED,
          threadId: params.conversationId,
          runId: openRunId,
        });
        openRunId = null;
      }

      yield { type: "done" };
      return;
    }

    if (now() - startedAt >= IN_APP_AGENT_WATCH_MAX_CONNECTION_MS) {
      return;
    }

    if (now() - lastKeepaliveAt >= IN_APP_AGENT_WATCH_KEEPALIVE_MS) {
      lastKeepaliveAt = now();
      yield null;
    }

    await sleep(IN_APP_AGENT_WATCH_TAIL_POLL_MS);
  }
}

/** Match foreground streaming by withholding persisted replay input. */
function toPublicEvent(event: AgUiEvent): AgUiEvent {
  if (event.type !== EventType.RUN_STARTED || event.input === undefined) {
    return event;
  }

  const publicEvent = { ...event };
  delete publicEvent.input;

  return publicEvent;
}

function syntheticFrame(
  cursor: number,
  event: AgUiEvent,
): InAppAgentWatchFrame {
  return {
    type: "event",
    sequenceNumber: cursor,
    event,
  };
}
