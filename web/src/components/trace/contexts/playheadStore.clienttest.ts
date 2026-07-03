// @vitest-environment jsdom

import {
  buildNodeWindows,
  computeActiveIds,
  createPlayheadStore,
  padActivationWindows,
  playbackRate,
  PLAYBACK_MAX_SECONDS,
  type NodeWindow,
} from "./playheadStore";
import { type TreeNode } from "../lib/types";

function makeNode(
  id: string,
  startMs: number,
  endMs: number | null,
  children: TreeNode[] = [],
): TreeNode {
  return {
    id,
    type: "SPAN",
    name: id,
    startTime: new Date(startMs),
    endTime: endMs != null ? new Date(endMs) : null,
    children,
    startTimeSinceTrace: 0,
    startTimeSinceParentStart: null,
    depth: 0,
    childrenDepth: 0,
  } as TreeNode;
}

const ORIGIN = new Date(0);

describe("playbackRate", () => {
  it("plays short traces in real time", () => {
    expect(playbackRate(3)).toBe(1);
    expect(playbackRate(PLAYBACK_MAX_SECONDS)).toBe(1);
  });

  it("compresses long traces to exactly the playback window", () => {
    expect(playbackRate(40)).toBe(40 / PLAYBACK_MAX_SECONDS);
  });
});

describe("buildNodeWindows", () => {
  it("flattens the whole tree into seconds-from-origin windows", () => {
    const roots = [
      makeNode("root", 0, 10_000, [makeNode("child", 2_000, 4_000)]),
    ];
    const windows = buildNodeWindows(roots, ORIGIN);
    const byId = new Map(windows.map((w) => [w.id, w]));
    expect(byId.get("root")).toEqual({ id: "root", startSec: 0, endSec: 10 });
    expect(byId.get("child")).toEqual({ id: "child", startSec: 2, endSec: 4 });
  });

  it("treats a missing endTime as a zero-length window", () => {
    const windows = buildNodeWindows([makeNode("n", 5_000, null)], ORIGIN);
    expect(windows[0]).toEqual({ id: "n", startSec: 5, endSec: 5 });
  });

  it("skips the synthetic TRACE wrapper but keeps its descendants", () => {
    // v3 traces wrap observations in a TRACE root (endTime null) — it must not
    // get an activation window, else padding makes the trace-name row glow
    // briefly at playback start.
    const traceRoot = {
      ...makeNode("trace-t1", 0, null, [makeNode("obs", 1_000, 2_000)]),
      type: "TRACE",
    } as TreeNode;
    const windows = buildNodeWindows([traceRoot], ORIGIN);
    expect(windows.map((w) => w.id)).toEqual(["obs"]);
  });
});

describe("padActivationWindows", () => {
  it("pads zero/short windows to the minimum glow span", () => {
    const windows: NodeWindow[] = [{ id: "n", startSec: 5, endSec: 5 }];
    const [padded] = padActivationWindows(windows, 5); // real-time: rate 1
    expect(padded!.endSec).toBeCloseTo(5.2); // MIN_GLOW_WALL_SECONDS
  });

  it("scales the pad by the compression rate for long traces", () => {
    const windows: NodeWindow[] = [{ id: "n", startSec: 0, endSec: 0 }];
    const [padded] = padActivationWindows(windows, 100); // rate 10
    expect(padded!.endSec).toBeCloseTo(2); // 0.2 wall-clock sec × rate 10
  });

  it("leaves already-long windows untouched (same reference)", () => {
    const w: NodeWindow = { id: "n", startSec: 0, endSec: 9 };
    const [padded] = padActivationWindows([w], 10);
    expect(padded).toBe(w);
  });
});

describe("computeActiveIds", () => {
  const windows: NodeWindow[] = [
    { id: "a", startSec: 0, endSec: 2 },
    { id: "b", startSec: 3, endSec: 3.1 },
    { id: "c", startSec: 5, endSec: 9 },
  ];

  it("point-samples when lo === hi", () => {
    expect([...computeActiveIds(windows, 1, 1)]).toEqual(["a"]);
    expect(computeActiveIds(windows, 4, 4).size).toBe(0);
  });

  it("sweeps the whole interval so short windows can't be skipped", () => {
    // A dropped frame jumping 2.5 → 4.5 still catches b's 100ms window.
    expect([...computeActiveIds(windows, 2.5, 4.5)]).toEqual(["b"]);
  });

  it("includes boundary touches", () => {
    expect(computeActiveIds(windows, 2, 3).has("a")).toBe(true);
    expect(computeActiveIds(windows, 2, 3).has("b")).toBe(true);
  });
});

describe("createPlayheadStore actions", () => {
  const windows: NodeWindow[] = [
    { id: "a", startSec: 0, endSec: 4 },
    { id: "b", startSec: 6, endSec: 10 },
  ];

  function seededStore() {
    const store = createPlayheadStore();
    store.getState().actions.syncTrace({
      traceDuration: 10,
      nodeWindows: windows,
      hard: true,
    });
    return store;
  }

  it("seekToSec clamps, shows the playhead, pauses, and computes the glow", () => {
    const store = seededStore();
    store.getState().actions.seekToSec(99);
    const s = store.getState();
    expect(s.playheadSec).toBe(10);
    expect(s.showPlayhead).toBe(true);
    expect(s.isPlaying).toBe(false);
    expect([...s.activeIds]).toEqual(["b"]);
  });

  it("keeps the activeIds reference stable when the set is unchanged", () => {
    const store = seededStore();
    store.getState().actions.seekToSec(1);
    const first = store.getState().activeIds;
    store.getState().actions.seekToSec(2); // still only "a"
    expect(store.getState().activeIds).toBe(first);
  });

  it("stop clears position, glow, and visibility", () => {
    const store = seededStore();
    store.getState().actions.seekToSec(7);
    store.getState().actions.stop();
    const s = store.getState();
    expect(s.playheadSec).toBe(0);
    expect(s.showPlayhead).toBe(false);
    expect(s.activeIds.size).toBe(0);
  });

  it("hard syncTrace resets playback for a new trace", () => {
    const store = seededStore();
    store.getState().actions.seekToSec(7);
    store.getState().actions.syncTrace({
      traceDuration: 5,
      nodeWindows: [{ id: "x", startSec: 0, endSec: 5 }],
      hard: true,
    });
    const s = store.getState();
    expect(s.traceDuration).toBe(5);
    expect(s.playheadSec).toBe(0);
    expect(s.showPlayhead).toBe(false);
    expect(s.activeIds.size).toBe(0);
  });

  it("soft syncTrace re-clamps the visible playhead against the new duration", () => {
    const store = seededStore();
    store.getState().actions.seekToSec(9);
    store.getState().actions.syncTrace({
      traceDuration: 6,
      nodeWindows: windows,
      hard: false,
    });
    const s = store.getState();
    expect(s.showPlayhead).toBe(true); // playhead survives same-trace churn
    expect(s.playheadSec).toBe(6); // re-clamped to the new duration
  });

  it("play is a no-op without a timeline", () => {
    const store = createPlayheadStore();
    store
      .getState()
      .actions.syncTrace({ traceDuration: 0, nodeWindows: [], hard: true });
    store.getState().actions.play();
    expect(store.getState().isPlaying).toBe(false);
  });
});
