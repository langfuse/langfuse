import { EventType } from "@ag-ui/core";

import { InAppAgentRunStatus, InAppAgentRunStatusSchema } from "../../index";
import { Prisma, type PrismaClient } from "../../db";
import {
  isActiveInAppAgentRunStatus,
  type InAppAgentWatchFrame,
} from "../backgroundWatch";
import type { AgUiEvent } from "../schema";
import { reconcileConversationRuns } from "./runLifecycle";
import {
  IN_APP_AGENT_HEARTBEAT_STALE_MS,
  IN_APP_AGENT_WATCH_KEEPALIVE_MS,
  IN_APP_AGENT_WATCH_MAX_CONNECTION_MS,
  IN_APP_AGENT_WATCH_TAIL_POLL_MS,
} from "./tunables";

/**
 * Tail persisted events while preserving AG-UI run framing. Synthetic frames
 * never advance beyond the event they frame, so reconnect cannot skip a row.
 * `null` asks the SSE transport to emit a keep-alive comment.
 *
 * Reconciliation here is evidence-driven, not periodic. A healthy watch issues
 * pure reads: the only writes are one reconcile when the stream attaches, and
 * one more if a poll ever observes a heartbeat that has already gone stale.
 * Polling a write-capable transaction every few seconds regardless of need was
 * the previous shape, and it put a transaction on the SSE path for every
 * attached viewer of every conversation.
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
  let reconciledStaleRun = false;

  const reconcile = () =>
    reconcileConversationRuns({
      prisma: params.prisma,
      projectId: params.projectId,
      conversationId: params.conversationId,
    });

  // On attach, because the run may have died while nothing was watching. A
  // reconnect lands here too, which is what bounds recovery for a conversation
  // whose viewer never closes the drawer.
  await reconcile();

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
            // Carried on the read we already make, so noticing a dead worker
            // costs nothing until there is something to notice.
            claimedAt: true,
            heartbeatAt: true,
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

    // The run claims to be active but its worker stopped signalling. Left
    // alone, this stream would poll a dead run until the connection cap and
    // then reconnect into the same state, so the drawer would sit thinking
    // indefinitely. Reconcile once and let the next poll read the outcome; if
    // the CAS lost a race, the reconnect's attach reconcile tries again.
    if (!reconciledStaleRun && isStaleClaimedRun(latestRun, now())) {
      reconciledStaleRun = true;
      await reconcile();
      continue;
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

/**
 * Only a claimed run can be judged by its heartbeat. Foreground runs insert as
 * RUNNING with neither timestamp and are stale-closed by their own 150s rule on
 * the read path, so they must not be judged here.
 */
function isStaleClaimedRun(
  run: {
    status: string | null;
    claimedAt?: Date | null;
    heartbeatAt?: Date | null;
  },
  now: number,
): boolean {
  if (run.status !== InAppAgentRunStatus.RUNNING) {
    return false;
  }

  const lastSign = run.heartbeatAt ?? run.claimedAt;

  // Nullish rather than `!== null`: a legacy row can carry neither timestamp,
  // and treating "no signal ever recorded" as stale would kill it.
  if (!lastSign) {
    return false;
  }

  return now - lastSign.getTime() > IN_APP_AGENT_HEARTBEAT_STALE_MS;
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
