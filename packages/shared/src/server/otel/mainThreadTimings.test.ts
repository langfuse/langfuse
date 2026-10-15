import { afterEach, describe, expect, it, vi } from "vitest";

const recordDistribution = vi.fn();
import {
  measureOtelMainThread,
  setOtelMainThreadTimingTags,
  withOtelMainThreadTimings,
} from "./mainThreadTimings";

afterEach(() => vi.restoreAllMocks());

describe("OTEL synchronous phase totals", () => {
  it("isolates early attempts, skips reference timers and excludes awaited gaps", async () => {
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.mocked(recordDistribution).mockClear();
    let resume!: () => void;
    const gap = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const early = withOtelMainThreadTimings(async () => {
      setOtelMainThreadTimingTags({
        media_path: "early",
        media_presence: "absent",
      });
      const dispatch = measureOtelMainThread("native_dispatch", () => {
        now += 3;
        return gap;
      });
      await dispatch;
      measureOtelMainThread("json_parse", () => {
        now += 5;
        measureOtelMainThread("nested", () => {
          now += 2;
        });
      });
      measureOtelMainThread("json_parse", () => {
        now += 7;
      });
    }, recordDistribution);
    now += 1000;
    const clockCallsBeforeReference = clock.mock.calls.length;
    await withOtelMainThreadTimings(async () => {
      setOtelMainThreadTimingTags({
        media_path: "reference",
        media_presence: "present",
      });
      measureOtelMainThread("json_parse", () => {
        now += 11;
        measureOtelMainThread("nested", () => {
          now += 2;
        });
      });
    }, recordDistribution);
    expect(clock).toHaveBeenCalledTimes(clockCallsBeforeReference);
    await withOtelMainThreadTimings(async () => {
      setOtelMainThreadTimingTags({
        media_path: "early",
        media_presence: "present",
      });
      measureOtelMainThread("json_parse", () => {
        now += 11;
      });
    }, recordDistribution);
    resume();
    await early;
    expect(
      vi
        .mocked(recordDistribution)
        .mock.calls.map(([, value, tags]) => ({ value, tags })),
    ).toEqual([
      {
        value: 11,
        tags: {
          media_path: "early",
          media_presence: "present",
          phase: "json_parse",
        },
      },
      {
        value: 3,
        tags: {
          media_path: "early",
          media_presence: "absent",
          phase: "native_dispatch",
        },
      },
      {
        value: 14,
        tags: {
          media_path: "early",
          media_presence: "absent",
          phase: "json_parse",
        },
      },
    ]);
  });

  it("preserves failures while emitting only the synchronous work already done", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.mocked(recordDistribution).mockClear();
    const error = new Error("invalid input");
    await expect(
      withOtelMainThreadTimings(async () => {
        setOtelMainThreadTimingTags({
          media_path: "early",
          media_presence: "unknown",
        });
        measureOtelMainThread("json_parse", () => {
          now += 4;
          throw error;
        });
      }, recordDistribution),
    ).rejects.toBe(error);
    expect(recordDistribution).toHaveBeenCalledWith(expect.any(String), 4, {
      media_path: "early",
      media_presence: "unknown",
      phase: "json_parse",
    });
    expect(measureOtelMainThread("json_parse", () => 42)).toBe(42);
    expect(recordDistribution).toHaveBeenCalledTimes(1);
  });
});
