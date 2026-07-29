import { EventType } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import { InAppAgentRunStatus } from "../../index";
import type { PrismaClient } from "../../db";
import type { InAppAgentWatchFrame } from "../backgroundWatch";
import { watchConversationFrames } from "./watch";

/**
 * The framing rules are what these tests protect, so the data source is a
 * fake: `@ag-ui/client` rejects a stream whose first event is not
 * `RUN_STARTED` and rejects events after `RUN_FINISHED`, and getting that
 * wrong is a runtime throw in the drawer that no type check can catch.
 */
type EventRow = {
  sequenceNumber: number;
  runId: string;
  event: Record<string, unknown>;
};

type RunRow = {
  id: string;
  status: InAppAgentRunStatus;
  errorCode: string | null;
  errorMessage: string | null;
  cancelRequestedAt?: Date | null;
};

function fakePrisma(polls: Array<{ events: EventRow[]; run: RunRow | null }>) {
  let pollIndex = 0;

  return {
    // reconcileConversationRuns runs first in every poll; it must find nothing
    // to do so it does not interfere with the framing under test.
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        inAppAgentRun: {
          findMany: async () => [],
          updateMany: async () => ({ count: 0 }),
        },
      }),
    inAppAgentRun: {
      findFirst: async () =>
        polls[Math.min(pollIndex, polls.length - 1)]?.run ?? null,
    },
    inAppAgentEvent: {
      findMany: async ({
        where,
      }: {
        where: { sequenceNumber: { gt: number } };
      }) => {
        const poll = polls[Math.min(pollIndex, polls.length - 1)];
        pollIndex += 1;

        return (poll?.events ?? []).filter(
          (row) => row.sequenceNumber > where.sequenceNumber.gt,
        );
      },
    },
  } as unknown as PrismaClient;
}

async function collect(
  prisma: PrismaClient,
  cursor: number,
): Promise<InAppAgentWatchFrame[]> {
  const frames: InAppAgentWatchFrame[] = [];

  for await (const frame of watchConversationFrames({
    prisma,
    projectId: "project-1",
    conversationId: "conversation-1",
    cursor,
    now: () => 0,
    sleep: async () => undefined,
  })) {
    if (frame !== null) {
      frames.push(frame);
    }
  }

  return frames;
}

const eventFrames = (frames: InAppAgentWatchFrame[]) =>
  frames.filter(
    (frame): frame is Extract<InAppAgentWatchFrame, { type: "event" }> =>
      frame.type === "event",
  );

const eventTypes = (frames: InAppAgentWatchFrame[]) =>
  eventFrames(frames).map((frame) => frame.event.type);

describe("watchConversationFrames", () => {
  const runStarted = (runId: string, sequenceNumber: number): EventRow => ({
    sequenceNumber,
    runId,
    event: {
      type: EventType.RUN_STARTED,
      runId,
      threadId: "conversation-1",
      // The persisted row carries the turn's input; the worker's replay reads
      // the user message out of it.
      input: {
        runId,
        messages: [{ id: "server-minted-id", role: "user", content: "hi" }],
      },
    },
  });

  const textMessage = (runId: string, sequenceNumber: number): EventRow => ({
    sequenceNumber,
    runId,
    event: {
      type: EventType.TEXT_MESSAGE_START,
      messageId: `m-${sequenceNumber}`,
    },
  });

  const runFinished = (runId: string, sequenceNumber: number): EventRow => ({
    sequenceNumber,
    runId,
    event: { type: EventType.RUN_FINISHED, runId, threadId: "conversation-1" },
  });

  const succeeded: RunRow = {
    id: "run-1",
    status: InAppAgentRunStatus.SUCCEEDED,
    errorCode: null,
    errorMessage: null,
    cancelRequestedAt: null,
  };

  it("relays a finished run verbatim and closes with a done frame", async () => {
    const frames = await collect(
      fakePrisma([
        {
          events: [
            runStarted("run-1", 0),
            textMessage("run-1", 1),
            runFinished("run-1", 2),
          ],
          run: succeeded,
        },
      ]),
      -1,
    );

    // No synthetic twin for the boundaries the worker already persisted.
    expect(eventTypes(frames)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.RUN_FINISHED,
    ]);
    expect(frames.at(-1)).toEqual({ type: "done" });
    expect(frames.filter((frame) => frame.type === "status")).toEqual([
      {
        type: "status",
        runId: "run-1",
        status: InAppAgentRunStatus.SUCCEEDED,
        errorCode: null,
        errorMessage: null,
        cancelRequested: false,
      },
    ]);
  });

  it("opens the run synthetically when attaching mid-run, without skipping the event it frames", async () => {
    const frames = await collect(
      fakePrisma([
        {
          events: [textMessage("run-1", 1), runFinished("run-1", 2)],
          run: succeeded,
        },
      ]),
      // The client hydrated through the persisted RUN_STARTED at 0.
      0,
    );

    expect(eventTypes(frames)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.RUN_FINISHED,
    ]);

    // A drop right after the synthetic frame must re-read event 1, not skip it.
    expect(eventFrames(frames)[0]?.sequenceNumber).toBe(0);
  });

  it("hands off from cursor to tail with no duplicated and no missed event", async () => {
    const frames = await collect(
      fakePrisma([
        {
          events: [textMessage("run-1", 1)],
          run: { ...succeeded, status: InAppAgentRunStatus.RUNNING },
        },
        {
          events: [
            textMessage("run-1", 1),
            textMessage("run-1", 2),
            runFinished("run-1", 3),
          ],
          run: succeeded,
        },
      ]),
      0,
    );

    const sequences = eventFrames(frames).map((frame) => frame.sequenceNumber);

    // 0 is the synthetic open; 1, 2, 3 are each relayed exactly once even
    // though poll two re-reported event 1 as still present.
    expect(sequences).toEqual([0, 1, 2, 3]);
  });

  it("closes a terminal run whose stream never persisted its own RUN_FINISHED", async () => {
    const frames = await collect(
      fakePrisma([
        {
          events: [runStarted("run-1", 0), textMessage("run-1", 1)],
          run: {
            id: "run-1",
            status: InAppAgentRunStatus.FAILED,
            errorCode: "worker_lost",
            errorMessage: "The run was interrupted",
          },
        },
      ]),
      -1,
    );

    // Without the synthetic close, the client's verifier would reject the next
    // run's RUN_STARTED on this stream.
    expect(eventTypes(frames)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.RUN_FINISHED,
    ]);
    expect(frames.at(-1)).toEqual({ type: "done" });
  });

  it("re-emits status when a cancel is requested while the run is still RUNNING", async () => {
    const running: RunRow = {
      ...succeeded,
      status: InAppAgentRunStatus.RUNNING,
    };

    const frames = await collect(
      fakePrisma([
        { events: [runStarted("run-1", 0)], run: running },
        {
          events: [],
          run: { ...running, cancelRequestedAt: new Date(1) },
        },
        { events: [runFinished("run-1", 1)], run: { ...succeeded } },
      ]),
      -1,
    );

    const statuses = frames.filter((frame) => frame.type === "status");

    // Status is deduplicated by key, so the cancel flag has to be part of that
    // key: it flips while the status is still RUNNING, and if that frame is
    // swallowed the drawer shows no sign that a stop is in flight.
    expect(statuses).toMatchObject([
      { status: InAppAgentRunStatus.RUNNING, cancelRequested: false },
      { status: InAppAgentRunStatus.RUNNING, cancelRequested: true },
      { status: InAppAgentRunStatus.SUCCEEDED, cancelRequested: false },
    ]);
  });

  it("strips RUN_STARTED input so the submitted message is not rendered twice", async () => {
    const frames = await collect(
      fakePrisma([
        {
          events: [runStarted("run-1", 0), runFinished("run-1", 1)],
          run: succeeded,
        },
      ]),
      -1,
    );

    // @ag-ui/client seeds agent.messages from RUN_STARTED.input.messages and
    // dedupes by id only. The submitting client already added the message under
    // its own id, so relaying the server's id renders the turn twice.
    const relayedRunStarted = eventFrames(frames).find(
      (frame) => frame.event.type === EventType.RUN_STARTED,
    );

    expect(relayedRunStarted?.event).not.toHaveProperty("input");
    expect(relayedRunStarted?.event).toMatchObject({
      type: EventType.RUN_STARTED,
      runId: "run-1",
    });
  });

  it("closes immediately when the conversation has no run with a readable status", async () => {
    // Legacy rows predate the status column, and the column is deliberately
    // still nullable. Polling such a conversation forever would reconnect in a
    // loop for a run that is not executing.
    const frames = await collect(fakePrisma([{ events: [], run: null }]), -1);

    expect(frames).toEqual([{ type: "done" }]);
  });

  it("closes one run and opens the next when a continuation follows", async () => {
    const frames = await collect(
      fakePrisma([
        {
          events: [
            runStarted("run-1", 0),
            textMessage("run-1", 1),
            // The parked parent never wrote RUN_FINISHED; the continuation's
            // first row is a plain event, not a RUN_STARTED.
            textMessage("run-2", 2),
            runFinished("run-2", 3),
          ],
          run: { ...succeeded, id: "run-2" },
        },
      ]),
      -1,
    );

    expect(eventTypes(frames)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.RUN_FINISHED,
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.RUN_FINISHED,
    ]);
  });
});
