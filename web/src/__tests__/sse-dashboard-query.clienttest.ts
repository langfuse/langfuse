/**
 * Tests for the SSE dashboard query hook's parsing and progress logic.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { TextDecoder, TextEncoder } from "util";
import {
  parseSSEBuffer,
  computeMonotonicPercent,
  useSSEDashboardQuery,
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

describe("useSSEDashboardQuery", () => {
  const originalFetch = global.fetch;
  const originalTextDecoder = global.TextDecoder;

  const createStreamReader = (chunks: Uint8Array[]) => {
    let index = 0;

    return {
      read: vi.fn().mockImplementation(async () => {
        if (index < chunks.length) {
          return {
            done: false,
            value: chunks[index++],
          };
        }

        return {
          done: true,
          value: undefined,
        };
      }),
    };
  };

  const createInput = (fromTimestamp: string, toTimestamp: string) => ({
    projectId: "project-1",
    version: "v1" as const,
    query: {
      view: "traces" as const,
      dimensions: [],
      metrics: [{ measure: "count", aggregation: "count" as const }],
      filters: [],
      timeDimension: null,
      fromTimestamp,
      toTimestamp,
      orderBy: null,
      chartConfig: { type: "BAR_TIME_SERIES" },
    },
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.TextDecoder = originalTextDecoder;
    vi.restoreAllMocks();
  });

  it("preserves successful state when disabled after the stream completes", async () => {
    const encoder = new TextEncoder();

    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      body: {
        getReader: () =>
          createStreamReader([
            encoder.encode(
              'event: row\ndata: {"count_count":42}\n\n' +
                "event: done\ndata: {}\n\n",
            ),
          ]),
      },
    })) as typeof fetch;
    global.TextDecoder = TextDecoder as typeof global.TextDecoder;

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useSSEDashboardQuery(
          createInput("2026-03-22T00:00:00.000Z", "2026-03-23T00:00:00.000Z"),
          {
            enabled,
            queryId: "widget-1",
          },
        ),
      {
        initialProps: { enabled: true },
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    rerender({ enabled: false });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.data).toEqual([{ count_count: 42 }]);
  });

  it("treats a changed input as pending immediately and hides stale results", async () => {
    const encoder = new TextEncoder();
    let releaseSecondResponse: (() => void) | null = null;

    global.fetch = vi
      .fn()
      .mockImplementationOnce(async () => ({
        ok: true,
        body: {
          getReader: () =>
            createStreamReader([
              encoder.encode(
                'event: row\ndata: {"count_count":42}\n\n' +
                  "event: done\ndata: {}\n\n",
              ),
            ]),
        },
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        body: {
          getReader: () => {
            let released = false;
            const waitForRelease = new Promise<void>((resolve) => {
              releaseSecondResponse = () => {
                released = true;
                resolve();
              };
            });

            return {
              read: vi.fn().mockImplementation(async () => {
                if (!released) {
                  await waitForRelease;
                }

                return {
                  done: true,
                  value: undefined,
                };
              }),
            };
          },
        },
      })) as typeof fetch;
    global.TextDecoder = TextDecoder as typeof global.TextDecoder;

    const firstInput = createInput(
      "2026-03-22T00:00:00.000Z",
      "2026-03-23T00:00:00.000Z",
    );
    const secondInput = createInput(
      "2026-03-16T00:00:00.000Z",
      "2026-03-23T00:00:00.000Z",
    );

    const { result, rerender } = renderHook(
      ({ input }) =>
        useSSEDashboardQuery(input, {
          enabled: true,
          queryId: "widget-1",
        }),
      {
        initialProps: { input: firstInput },
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    rerender({ input: secondInput });

    expect(result.current.isPending).toBe(true);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.fetchStatus).toBe("fetching");
    expect(result.current.data).toBeUndefined();
    expect(result.current.progress).toBeNull();
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(releaseSecondResponse).not.toBeNull();
    });

    releaseSecondResponse?.();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
