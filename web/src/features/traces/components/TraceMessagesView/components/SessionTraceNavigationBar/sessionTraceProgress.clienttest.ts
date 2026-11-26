import { describe, expect, it } from "vitest";
import { formatLocalIsoDate } from "@/src/utils/dates";
import { buildSessionTraceProgress } from "./sessionTraceProgress";

const start = Date.parse("2026-03-14T14:00:00.000Z");
const minute = 60_000;

describe("buildSessionTraceProgress", () => {
  it("places the current span, other traces, and idle gaps on the session range", () => {
    const progress = buildSessionTraceProgress(
      [
        { id: "first", startMs: start, endMs: start + 2 * minute },
        {
          id: "current",
          startMs: start + 64 * minute,
          endMs: start + 67 * minute,
        },
        {
          id: "last",
          startMs: start + 70 * minute,
          endMs: start + 75 * minute,
        },
      ],
      "current",
    );
    expect(progress).not.toBeNull();
    if (!progress) return;
    expect(progress.label).toBe(
      formatLocalIsoDate(new Date(start + 64 * minute), false, "second").slice(
        11,
      ),
    );
    expect(progress.valueText).toBe("1h 4m / 1h 15m");
    const idle = progress.segments.find((segment) => segment.tone === "idle");
    const current = progress.segments.find(
      (segment) => segment.tone === "fill",
    );
    const others = progress.segments.filter(
      (segment) => segment.tone === "muted",
    );
    expect(idle?.start).toBeCloseTo((2 / 75) * 100, 5);
    expect(idle?.end).toBeCloseTo((64 / 75) * 100, 5);
    expect(current?.start).toBeCloseTo((64 / 75) * 100, 5);
    expect(others).toHaveLength(2);
    expect(progress.segments.at(-1)?.tone).toBe("fill");
  });
});
