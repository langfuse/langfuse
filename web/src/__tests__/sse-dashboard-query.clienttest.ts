/**
 * Tests for the SSE dashboard query hook's parsing and progress logic.
 */
import {
  parseSSEBuffer,
  computeMonotonicPercent,
} from "@/src/hooks/useSSEDashboardQuery";

describe("parseSSEBuffer", () => {
  it("should parse a single complete progress event", () => {
    const buffer =
      'event: progress\ndata: {"read_rows":"100","total_rows_to_read":"1000"}\n\n';
    const { events, remaining } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("progress");
    expect(remaining).toBe("");

    const data = JSON.parse(events[0].data);
    expect(data.read_rows).toBe("100");
    expect(data.total_rows_to_read).toBe("1000");
  });

  it("should parse multiple events in one buffer", () => {
    const buffer =
      'event: progress\ndata: {"read_rows":"50"}\n\n' +
      'event: row\ndata: {"count":42}\n\n' +
      "event: done\ndata: {}\n\n";

    const { events, remaining } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("progress");
    expect(events[1].type).toBe("row");
    expect(events[2].type).toBe("done");
    expect(remaining).toBe("");
  });

  it("should handle incomplete buffer (no trailing double newline)", () => {
    const buffer = 'event: progress\ndata: {"read_rows":"50"}';
    const { events, remaining } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(0);
    expect(remaining).toBe('event: progress\ndata: {"read_rows":"50"}');
  });

  it("should handle buffer with complete event + incomplete trailing event", () => {
    const buffer =
      'event: progress\ndata: {"read_rows":"50"}\n\n' +
      'event: progress\ndata: {"read_ro';

    const { events, remaining } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("progress");
    expect(remaining).toBe('event: progress\ndata: {"read_ro');
  });

  it("should parse error events", () => {
    const buffer = 'event: error\ndata: {"message":"Query timed out"}\n\n';
    const { events } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");

    const data = JSON.parse(events[0].data);
    expect(data.message).toBe("Query timed out");
  });

  it("should handle empty blocks between events", () => {
    const buffer =
      'event: progress\ndata: {"x":1}\n\n' +
      "\n\n" +
      "event: result\ndata: []\n\n";

    const { events } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("progress");
    expect(events[1].type).toBe("result");
  });

  it("should default event type to 'message' when no event line", () => {
    const buffer = 'data: {"foo":"bar"}\n\n';
    const { events } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("message");
  });

  it("should skip blocks with no data line", () => {
    const buffer = "event: progress\n\n";
    const { events } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(0);
  });
});

describe("computeMonotonicPercent", () => {
  it("should compute percent from read_rows / total_rows_to_read", () => {
    const percent = computeMonotonicPercent(3_000_000, 10_000_000, 0);
    expect(percent).toBeCloseTo(0.3);
  });

  it("should handle zero total_rows_to_read", () => {
    const percent = computeMonotonicPercent(0, 0, 0);
    expect(percent).toBe(0);
  });

  it("should never decrease (monotonic progress)", () => {
    const updates = [
      { read: 100, total: 1000 }, // 0.1
      { read: 300, total: 1000 }, // 0.3
      { read: 250, total: 1000 }, // 0.25 (regression)
      { read: 500, total: 1000 }, // 0.5
      { read: 450, total: 1000 }, // 0.45 (regression)
      { read: 800, total: 1000 }, // 0.8
      { read: 1000, total: 1000 }, // 1.0
    ];

    let prevMax = 0;
    const smoothed: number[] = [];

    for (const { read, total } of updates) {
      prevMax = computeMonotonicPercent(read, total, prevMax);
      smoothed.push(prevMax);
    }

    for (let i = 1; i < smoothed.length; i++) {
      expect(smoothed[i]).toBeGreaterThanOrEqual(smoothed[i - 1]);
    }

    expect(smoothed).toEqual([0.1, 0.3, 0.3, 0.5, 0.5, 0.8, 1.0]);
  });

  it("should preserve previous max when current percent is lower", () => {
    expect(computeMonotonicPercent(10, 100, 0.5)).toBe(0.5);
  });
});
