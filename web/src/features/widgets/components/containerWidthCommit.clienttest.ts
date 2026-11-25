// @vitest-environment node

import { nextContainerWidthCommit } from "./containerWidthCommit";

const settleMs = 200;

describe("nextContainerWidthCommit", () => {
  it("publishes every changed sample during the follow window", () => {
    const decision = nextContainerWidthCommit({
      now: 360,
      gestureStartedAt: 0,
      lastCommittedAt: 344,
      pendingWidth: 980,
      committedWidth: 988,
      settleMs,
    });

    expect(decision).toEqual({ kind: "commit", width: 980 });
  });

  it("skips a sample that does not change the committed width", () => {
    const decision = nextContainerWidthCommit({
      now: 16,
      gestureStartedAt: 0,
      lastCommittedAt: 0,
      pendingWidth: 1000,
      committedWidth: 1000,
      settleMs,
    });

    expect(decision).toEqual({ kind: "defer" });
  });

  it("coarsens samples after the follow window until the settle interval elapses", () => {
    const held = nextContainerWidthCommit({
      now: 700,
      gestureStartedAt: 0,
      lastCommittedAt: 600,
      pendingWidth: 700,
      committedWidth: 760,
      settleMs,
    });
    const due = nextContainerWidthCommit({
      now: 800,
      gestureStartedAt: 0,
      lastCommittedAt: 600,
      pendingWidth: 640,
      committedWidth: 760,
      settleMs,
    });

    expect(held).toEqual({ kind: "defer" });
    expect(due).toEqual({ kind: "commit", width: 640 });
  });
});
