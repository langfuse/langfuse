// @vitest-environment jsdom

import { formatIntervalSeconds } from "./dates";

describe("formatIntervalSeconds", () => {
  it("keeps sub-minute durations in decimal-seconds form", () => {
    expect(formatIntervalSeconds(5)).toBe("5.00s");
    expect(formatIntervalSeconds(59.4, 1)).toBe("59.4s");
  });

  it("zero-pads single-digit minute/second components", () => {
    // pad() previously sliced from the front ("005".slice(2) === "5"), so
    // single-digit components rendered unpadded ("20m 0s", "1h 5m 3s").
    expect(formatIntervalSeconds(1200)).toBe("20m 00s");
    expect(formatIntervalSeconds(3903)).toBe("1h 05m 03s");
    expect(formatIntervalSeconds(9945)).toBe("2h 45m 45s");
  });
});
