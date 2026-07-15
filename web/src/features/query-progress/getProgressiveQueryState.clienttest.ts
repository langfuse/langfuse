import { getProgressiveQueryState } from "./getProgressiveQueryState";
import { type ProgressiveQueryEvent } from "@langfuse/shared";

const progressEvent = {
  type: "progress",
  progress: {
    readRows: 50,
    totalRowsToRead: 100,
    readBytes: 1024,
    elapsedNs: 100,
    fraction: 0.5,
  },
} satisfies ProgressiveQueryEvent<{ observations: string[] }>;

describe("getProgressiveQueryState", () => {
  it("keeps a progress-only stream pending", () => {
    expect(getProgressiveQueryState([progressEvent])).toEqual({
      data: undefined,
      hasResult: false,
      progress: progressEvent.progress,
    });
  });

  it("returns the result and clears completed progress", () => {
    const resultEvent = {
      type: "result",
      data: { observations: ["observation-1"] },
    } satisfies ProgressiveQueryEvent<{ observations: string[] }>;

    expect(getProgressiveQueryState([progressEvent, resultEvent])).toEqual({
      data: resultEvent.data,
      hasResult: true,
      progress: null,
    });
  });

  it("retains the previous result while the same query starts a new stream", () => {
    const previousData = { observations: ["observation-1"] };

    expect(getProgressiveQueryState([], previousData)).toEqual({
      data: previousData,
      hasResult: false,
      progress: null,
    });
  });
});
