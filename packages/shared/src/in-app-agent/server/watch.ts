import { EventType } from "@ag-ui/core";

import { InAppAgentRunStatus } from "../../index";
import type { PrismaClient } from "../../db";
import {
  isActiveInAppAgentRunStatus,
  type InAppAgentWatchFrame,
} from "../backgroundWatch";
import type { AgUiEvent } from "../schema";
import { reconcileConversationRuns } from "./runLifecycle";
import {
  IN_APP_AGENT_WATCH_KEEPALIVE_MS,
  IN_APP_AGENT_WATCH_MAX_CONNECTION_MS,
  IN_APP_AGENT_WATCH_TAIL_POLL_MS,
} from "./tunables";

/**
 * The watch stream's frame source, kept out of the HTTP route so it is
 * testable without a server.
 *
 * Yields `null` where the transport should send a keep-alive comment: drops
 * are normal and the cursor makes them free, but an idle load balancer must
 * not decide the point for us during a long model call.
 *
 * ## Run framing is this generator's job
 *
 * `@ag-ui/client` verifies event ordering on the way in: the first event of a
 * stream must be `RUN_STARTED`, nothing may follow `RUN_FINISHED` without a
 * new `RUN_STARTED`, and `RUN_STARTED` may not arrive while a run is still
 * open. Raw persisted rows satisfy none of that after a mid-run reconnect —
 * the cursor is past the run's `RUN_STARTED` row, so the first tail event
 * would be a bare `TEXT_MESSAGE_START`.
 *
 * So the generator tracks the open run and synthesizes the boundaries the
 * client's verifier requires: it opens a run before relaying that run's first
 * event and closes it when the events give way to another run's or the run
 * reaches a terminal status. Persisted boundary events pass through and
 * suppress their synthetic twin, so a cold attach at cursor 0 is byte-faithful
 * to what the worker wrote.
 *
 * What makes this safe rather than clever: the worker appends *compacted
 * units* (a whole message, a whole tool call), so every sequence boundary
 * falls between units and the first event after any cursor is always a
 * `*_START`. There is no partial unit to stitch.
 *
 * ## `sequenceNumber` on a frame means "cursor value valid after this frame"
 *
 * For persisted events that is the row's own number. Synthetic frames carry
 * the cursor of the event they precede *minus one*, so a client that drops
 * right after a synthetic frame re-reads the real event it was framing rather
 * than skipping it. The value is therefore monotonic and never advances past
 * an unreplayed row.
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
    // Reads are what make dead runs visibly dead; this is the only reconciler.
    await reconcileConversationRuns({
      prisma: params.prisma,
      projectId: params.projectId,
      conversationId: params.conversationId,
    });

    // Status first, events second, deliberately. The worker appends a run's
    // events *before* its terminal CAS, so reading the status first means a
    // terminal status observed here is always followed by an event read that
    // already contains everything that run wrote. The other order can observe
    // "terminal" and miss the final events.
    const latestRun = await params.prisma.inAppAgentRun.findFirst({
      where: {
        projectId: params.projectId,
        conversationId: params.conversationId,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        cancelRequestedAt: true,
      },
    });

    const events = await params.prisma.inAppAgentEvent.findMany({
      where: {
        projectId: params.projectId,
        conversationId: params.conversationId,
        sequenceNumber: { gt: cursor },
      },
      orderBy: { sequenceNumber: "asc" },
      select: { sequenceNumber: true, runId: true, event: true },
    });

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
        event: toPublicEvent(event) as unknown as Record<string, unknown>,
      };

      if (
        event.type === EventType.RUN_FINISHED ||
        event.type === EventType.RUN_ERROR
      ) {
        openRunId = null;
      }

      cursor = row.sequenceNumber;
    }

    // No run, or a legacy row written before the status column existed: there
    // is nothing executing, so close rather than poll forever.
    if (!latestRun?.status) {
      yield { type: "done" };
      return;
    }

    const status = latestRun.status as InAppAgentRunStatus;
    const cancelRequested = Boolean(latestRun.cancelRequestedAt);
    // Part of the key: a cancel request is observable while the status is still
    // RUNNING, and that transition has to reach the client.
    const statusKey = `${latestRun.id}:${status}:${cancelRequested}`;

    if (statusKey !== lastStatusKey) {
      lastStatusKey = statusKey;
      yield {
        type: "status",
        runId: latestRun.id,
        status,
        errorCode: latestRun.errorCode,
        errorMessage: latestRun.errorMessage,
        cancelRequested,
      };
    }

    if (!isActiveInAppAgentRunStatus(status)) {
      // A terminal run whose stream never wrote its own RUN_FINISHED (the
      // worker died, or the run parked for approval) still has to close, or
      // the client's verifier rejects the next run's RUN_STARTED.
      if (openRunId) {
        yield syntheticFrame(cursor, {
          type: EventType.RUN_FINISHED,
          threadId: params.conversationId,
          runId: openRunId,
        });
        openRunId = null;
      }

      // The done frame — not the close itself — is the client's
      // stop-reconnecting signal.
      yield { type: "done" };
      return;
    }

    if (now() - startedAt >= IN_APP_AGENT_WATCH_MAX_CONNECTION_MS) {
      // Deliberate end well inside the route's duration limit. The client
      // reconnects with its cursor through the same path as a fresh page
      // load, so this is not an error and emits no done frame.
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
 * Strip `RUN_STARTED.input` before the event reaches a browser.
 *
 * The persisted row has to carry the turn's input — it is the only place the
 * user message is stored, and the worker's replay rebuilds model context from
 * it. But `@ag-ui/client` seeds `agent.messages` from a received
 * `RUN_STARTED.input.messages`, deduplicating **by message id only**. The
 * submitting client already added that message under its own locally-minted
 * id, so relaying the server's id would render the same turn twice until the
 * next `getConversation` refetch replaced local state.
 *
 * The foreground stream solves this the same way (`normalizeAdapterEvent` in
 * `agent.ts` deletes `input` on the way out); the tail has to match it, since
 * both feed the identical client pipeline.
 */
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
    event: event as unknown as Record<string, unknown>,
  };
}
