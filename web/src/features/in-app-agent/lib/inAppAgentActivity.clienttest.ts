import { describe, expect, it } from "vitest";

import { InAppAgentRunStatus } from "@langfuse/shared";

import {
  IN_APP_AGENT_ACTIVITY_TRACKED_RUN_ID_LIMIT,
  getInAppAgentActivityByConversationId,
  getInAppAgentAttentionCount,
  getInAppAgentTrackedRunIds,
  markInAppAgentActivityDelivered,
  markInAppAgentConversationSeen,
  reconcileInAppAgentActivityLedger,
  type InAppAgentActivityLedger,
  type InAppAgentActivityRunSummary,
} from "./inAppAgentActivity";

const run = (
  overrides: Partial<InAppAgentActivityRunSummary> = {},
): InAppAgentActivityRunSummary => ({
  conversationId: "conversation-1",
  title: "Investigate latency",
  runId: "run-1",
  status: InAppAgentRunStatus.RUNNING,
  errorCode: null,
  cancelRequested: false,
  ...overrides,
});

const sync = (
  ledger: InAppAgentActivityLedger,
  runs: InAppAgentActivityRunSummary[],
  options: {
    requestedRunIds?: string[];
    visibleConversationId?: string | null;
  } = {},
) => reconcileInAppAgentActivityLedger({ ledger, runs, ...options });

describe("in-app agent activity ledger", () => {
  it("baselines finished history as seen but never an in-flight run", () => {
    // First use on this device: an existing backlog must not light up, yet a run
    // that is still executing has an outcome the user has not been told about.
    const ledger = sync(null, [
      run({
        conversationId: "old",
        runId: "old-run",
        status: InAppAgentRunStatus.SUCCEEDED,
      }),
      run({
        conversationId: "live",
        runId: "live-run",
        status: InAppAgentRunStatus.RUNNING,
      }),
    ]);

    // Retained as an acknowledged tombstone, but never surfaced.
    expect(
      getInAppAgentActivityByConversationId(ledger).get("old"),
    ).toBeUndefined();
    expect(ledger?.entries.live).toMatchObject({
      runId: "live-run",
      seen: false,
      toastDelivered: false,
    });

    const afterCompletion = sync(ledger, [
      run({
        conversationId: "live",
        runId: "live-run",
        status: InAppAgentRunStatus.SUCCEEDED,
      }),
    ]);

    expect(
      getInAppAgentActivityByConversationId(afterCompletion).get("live")?.state,
    ).toBe("done-unread");
    expect(getInAppAgentAttentionCount(afterCompletion)).toBe(1);
  });

  it("discovers a run that finished while the app was closed", () => {
    // The ledger persists the run id precisely so it can be adjudicated on
    // return: a terminal run is in neither the attention set nor any in-memory
    // state that survived the reload.
    const beforeClose = sync(null, [
      run({ conversationId: "away", runId: "away-run" }),
    ]);

    expect(
      getInAppAgentTrackedRunIds(
        beforeClose,
        IN_APP_AGENT_ACTIVITY_TRACKED_RUN_ID_LIMIT,
      ),
    ).toEqual(["away-run"]);

    const afterReturn = sync(
      beforeClose,
      [
        run({
          conversationId: "away",
          runId: "away-run",
          status: InAppAgentRunStatus.FAILED,
        }),
      ],
      { requestedRunIds: ["away-run"] },
    );

    expect(
      getInAppAgentActivityByConversationId(afterReturn).get("away")?.state,
    ).toBe("failed-unread");
  });

  it("acknowledges only what the user can actually see", () => {
    const ledger = sync(
      null,
      [
        run({
          conversationId: "watched",
          runId: "watched-run",
          status: InAppAgentRunStatus.SUCCEEDED,
        }),
        run({
          conversationId: "hidden",
          runId: "hidden-run",
          status: InAppAgentRunStatus.SUCCEEDED,
        }),
      ],
      { visibleConversationId: "watched" },
    );

    // The visible one is acknowledged on arrival; the hidden one is baselined
    // as history because this is a first sync. Neither surfaces.
    expect(getInAppAgentActivityByConversationId(ledger).size).toBe(0);

    const second = sync(ledger, [
      run({
        conversationId: "hidden",
        runId: "hidden-run-2",
        status: InAppAgentRunStatus.SUCCEEDED,
      }),
    ]);

    expect(
      getInAppAgentActivityByConversationId(second).get("hidden")?.state,
    ).toBe("done-unread");
    expect(
      getInAppAgentActivityByConversationId(
        markInAppAgentConversationSeen(second, "hidden"),
      ).size,
    ).toBe(0);
  });

  it("keeps an approval counted after it has been read, and never counts mere execution", () => {
    const parked = sync(null, [
      run({
        conversationId: "approve",
        runId: "approve-run",
        status: InAppAgentRunStatus.AWAITING_APPROVAL,
      }),
    ]);
    const read = markInAppAgentConversationSeen(parked, "approve");

    expect(
      getInAppAgentActivityByConversationId(read).get("approve")?.state,
    ).toBe("approval");
    expect(getInAppAgentAttentionCount(read)).toBe(1);

    const running = sync(null, [
      run({ conversationId: "busy", runId: "busy-run" }),
    ]);

    expect(
      getInAppAgentActivityByConversationId(running).get("busy")?.state,
    ).toBe("running");
    expect(getInAppAgentAttentionCount(running)).toBe(0);
  });

  it("treats a cancelled run as already known and never surfaces it", () => {
    const ledger = sync(null, [
      run({ conversationId: "stopped", runId: "stopped-run" }),
    ]);
    const cancelled = sync(ledger, [
      run({
        conversationId: "stopped",
        runId: "stopped-run",
        status: InAppAgentRunStatus.CANCELLED,
      }),
    ]);

    expect(
      getInAppAgentActivityByConversationId(cancelled).get("stopped"),
    ).toBeUndefined();
    expect(getInAppAgentAttentionCount(cancelled)).toBe(0);
  });

  it("returns the same ledger when a poll changes nothing", () => {
    const ledger = sync(null, [run()]);

    expect(sync(ledger, [run()])).toBe(ledger);
  });

  it("ignores a stale report that a finished run is running again", () => {
    // The tracked-run request is derived from this ledger, so settling a run
    // switches which query cache entry is read — and that entry can hold a
    // reply fetched while the run was still executing. Accepting it flipped the
    // run back, which switched the request back, which read the finished reply
    // again: an infinite render loop that tore the assistant down.
    const running = run({
      runId: "run-1",
      status: InAppAgentRunStatus.RUNNING,
    });
    const finished = run({
      runId: "run-1",
      status: InAppAgentRunStatus.SUCCEEDED,
    });

    const settled = sync(sync(null, [running]), [finished]);
    expect(settled?.entries["conversation-1"]?.status).toBe(
      InAppAgentRunStatus.SUCCEEDED,
    );

    // The stale reply must change nothing at all, reference included.
    expect(sync(settled, [running])).toBe(settled);
  });

  it("keeps a run acknowledged when the drawer closes and reopens", () => {
    // The local session republishes the selected conversation's settled run on
    // every render. Acknowledgement therefore has to outlive the render that
    // granted it: deleting the entry once acknowledged let the next
    // not-visible render resurrect the same run as unread, so the badge ticked
    // up whenever the drawer closed and dismissed cards came back.
    const settled = run({
      conversationId: "watching",
      runId: "watching-run",
      status: InAppAgentRunStatus.SUCCEEDED,
    });

    const whileOpen = sync(null, [settled], {
      visibleConversationId: "watching",
    });
    expect(getInAppAgentAttentionCount(whileOpen)).toBe(0);

    // Drawer closed: nothing is visible, but the run is still republished.
    const whileClosed = sync(whileOpen, [settled], {
      visibleConversationId: null,
    });
    expect(getInAppAgentAttentionCount(whileClosed)).toBe(0);
    expect(
      getInAppAgentActivityByConversationId(whileClosed).get("watching"),
    ).toBeUndefined();

    // And reopening does not flip it back either.
    expect(
      getInAppAgentAttentionCount(
        sync(whileClosed, [settled], { visibleConversationId: "watching" }),
      ),
    ).toBe(0);
  });

  it("stays stable when a run is acknowledged and republished in the same pass", () => {
    // The selected conversation's settled run is republished on every render by
    // the local session. It is acknowledged on arrival (the user is looking at
    // it) and then pruned as fully acknowledged — a net no-op that must not
    // report a change, or every render writes localStorage, whose cross-tab
    // event feeds a fresh object straight back in (React #185).
    const settledAndVisible = run({
      conversationId: "watching",
      runId: "watching-run",
      status: InAppAgentRunStatus.SUCCEEDED,
    });
    const options = { visibleConversationId: "watching" };

    const first = sync(null, [settledAndVisible], options);
    expect(getInAppAgentActivityByConversationId(first).size).toBe(0);

    expect(sync(first, [settledAndVisible], options)).toBe(first);
  });

  it("keeps a dismissed card dismissed when its run is republished", () => {
    // Dismissal records delivery. If a later republish of the same run reset
    // that flag, the card would reappear and could never be clicked away.
    const finished = sync(null, [run({ runId: "run-1" })]);
    const done = sync(finished, [
      run({ runId: "run-1", status: InAppAgentRunStatus.SUCCEEDED }),
    ]);
    const announced = markInAppAgentActivityDelivered(done, ["conversation-1"]);

    const republished = sync(announced, [
      run({ runId: "run-1", status: InAppAgentRunStatus.SUCCEEDED }),
    ]);

    expect(republished?.entries["conversation-1"]).toMatchObject({
      toastDelivered: true,
      seen: false,
    });
    // Still unread — dismissing a card must not mark the conversation read.
    expect(getInAppAgentAttentionCount(republished)).toBe(1);
  });
});
