// @vitest-environment node

import {
  containerWidthScale,
  nextContainerWidthCommit,
} from "./containerWidthCommit";

describe("nextContainerWidthCommit", () => {
  it("defers every sample until the resize has settled", () => {
    const decision = nextContainerWidthCommit({
      pendingWidth: 980,
      committedWidth: 1100,
      settled: false,
    });

    expect(decision).toEqual({ kind: "defer" });
  });

  it("publishes the settled width once", () => {
    const decision = nextContainerWidthCommit({
      pendingWidth: 980,
      committedWidth: 1100,
      settled: true,
    });

    expect(decision).toEqual({ kind: "commit", width: 980 });
  });

  it("skips a settled sample that matches the committed width", () => {
    const decision = nextContainerWidthCommit({
      pendingWidth: 1100,
      committedWidth: 1100,
      settled: true,
    });

    expect(decision).toEqual({ kind: "defer" });
  });
});

describe("containerWidthScale", () => {
  it("fills the live container from the committed layout width", () => {
    expect(containerWidthScale(1212, 1368)).toBeCloseTo(1368 / 1212);
    expect(containerWidthScale(1212, 1212)).toBe(1);
    expect(containerWidthScale(0, 1368)).toBe(1);
  });
});
