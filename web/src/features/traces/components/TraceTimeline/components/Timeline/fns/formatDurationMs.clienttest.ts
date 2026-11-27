import { describe, expect, it } from "vitest";
import { formatDurationMs } from "./formatDurationMs";

describe("formatDurationMs", () => {
  it("keeps labels short at every magnitude", () => {
    expect(formatDurationMs(0)).toBe("0ms");
    expect(formatDurationMs(486)).toBe("486ms");
    expect(formatDurationMs(1_240)).toBe("1.24s");
    expect(formatDurationMs(36_020)).toBe("36.02s");
    expect(formatDurationMs(95_000)).toBe("1m 35s");
    expect(formatDurationMs(5_400_000)).toBe("1h 30m");
    expect(formatDurationMs(NaN)).toBe("0ms");
  });
});
