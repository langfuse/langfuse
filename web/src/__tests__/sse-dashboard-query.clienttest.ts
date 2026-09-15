/**
 * Tests for the SSE dashboard query hook's parsing and progress logic.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { TextDecoder, TextEncoder } from "util";
import {
  parseSSEBuffer,
  computeMonotonicPercent,
  fetchDashboardSSERows,
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

  const createWrapper = () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    return wrapper;
  };

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

  type TestInput = ReturnType<typeof createInput>;

  // Mirrors production: the scheduler wrapper derives the cache key from the
  // query input, so a changed input is a new key.
  const renderSSEHook = (initial: { input: TestInput; enabled: boolean }) =>
    renderHook(
      ({ input, enabled }: { input: TestInput; enabled: boolean }) =>
        useSSEDashboardQuery(input, {
          enabled,
          queryKey: ["sse-test", input],
          staleTime: 0,
          gcTime: Number.POSITIVE_INFINITY,
        }),
      { initialProps: initial, wrapper: createWrapper() },
    );

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

    const input = createInput(
      "2026-03-22T00:00:00.000Z",
      "2026-03-23T00:00:00.000Z",
    );
    const { result, rerender } = renderSSEHook({ input, enabled: true });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    rerender({ input, enabled: false });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.data).toEqual([{ count_count: 42 }]);
  });

  it("keeps previously loaded rows during a same-input re-run", async () => {
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
            let step = 0;
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

                if (step === 0) {
                  step += 1;
                  return {
                    done: false,
                    value: encoder.encode(
                      'event: row\ndata: {"count_count":99}\n\n' +
                        "event: done\ndata: {}\n\n",
                    ),
                  };
                }

                return { done: true, value: undefined };
              }),
            };
          },
        },
      })) as typeof fetch;
    global.TextDecoder = TextDecoder as typeof global.TextDecoder;

    const input = createInput(
      "2026-03-22T00:00:00.000Z",
      "2026-03-23T00:00:00.000Z",
    );
    const { result, rerender } = renderSSEHook({ input, enabled: true });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual([{ count_count: 42 }]);

    // Scheduler re-promotion: the widget is disabled, then re-enabled with the
    // exact same query input (a re-run it did not need).
    rerender({ input, enabled: false });
    rerender({ input, enabled: true });

    // The second stream is in flight (a background refetch). The chart must
    // NOT blank: the previously loaded rows stay rendered until fresh rows
    // arrive, and the run is not "pending" (no loading overlay).
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(result.current.fetchStatus).toBe("fetching");
    });
    expect(result.current.isPending).toBe(false);
    expect(result.current.data).toEqual([{ count_count: 42 }]);

    (releaseSecondResponse as (() => void) | null)?.();

    await waitFor(() => {
      expect(result.current.data).toEqual([{ count_count: 99 }]);
    });
    expect(result.current.isSuccess).toBe(true);
  });

  it("clears stale rows when a same-input re-run errors", async () => {
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
            let step = 0;
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

                if (step === 0) {
                  step += 1;
                  return {
                    done: false,
                    value: encoder.encode(
                      'event: error\ndata: {"message":"boom"}\n\n',
                    ),
                  };
                }

                return { done: true, value: undefined };
              }),
            };
          },
        },
      })) as typeof fetch;
    global.TextDecoder = TextDecoder as typeof global.TextDecoder;

    const input = createInput(
      "2026-03-22T00:00:00.000Z",
      "2026-03-23T00:00:00.000Z",
    );
    const { result, rerender } = renderSSEHook({ input, enabled: true });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual([{ count_count: 42 }]);

    rerender({ input, enabled: false });
    rerender({ input, enabled: true });

    // While the re-run is in flight, previous rows are still shown.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(result.current.fetchStatus).toBe("fetching");
    });
    expect(result.current.data).toEqual([{ count_count: 42 }]);

    // Once it errors, the stale success rows must not linger behind the error.
    (releaseSecondResponse as (() => void) | null)?.();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBe("boom");
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

    const { result, rerender } = renderSSEHook({
      input: firstInput,
      enabled: true,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    rerender({ input: secondInput, enabled: true });

    expect(result.current.isPending).toBe(true);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(result.current.progress).toBeNull();
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(releaseSecondResponse).not.toBeNull();
    });

    // TS control-flow analysis cannot see the assignment inside the mock's
    // closure and narrows the variable to `null`; widen it back to its
    // declared type.
    (releaseSecondResponse as (() => void) | null)?.();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

// The two degrade paths that must fail visibly instead of wedging a widget or
// caching partial rows as a fresh success.
describe("fetchDashboardSSERows degrade paths", () => {
  const originalFetch = global.fetch;
  const originalTextDecoder = global.TextDecoder;

  const input = {
    projectId: "project-1",
    version: "v1" as const,
    query: {
      view: "traces" as const,
      dimensions: [],
      metrics: [{ measure: "count", aggregation: "count" as const }],
      filters: [],
      timeDimension: null,
      fromTimestamp: "2026-03-22T00:00:00.000Z",
      toTimestamp: "2026-03-23T00:00:00.000Z",
      orderBy: null,
    },
  };

  afterEach(() => {
    global.fetch = originalFetch;
    global.TextDecoder = originalTextDecoder;
    vi.restoreAllMocks();
  });

  it("aborts a stalled stream with a real error (never forever-pending)", async () => {
    const encoder = new TextEncoder();
    global.TextDecoder = TextDecoder as typeof global.TextDecoder;
    global.fetch = vi.fn().mockImplementation(async (_url, init) => ({
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: encoder.encode('event: row\ndata: {"count_count":1}\n\n'),
            })
            // Second read never resolves — until the watchdog aborts.
            .mockImplementation(
              () =>
                new Promise((_resolve, reject) => {
                  (init as RequestInit).signal?.addEventListener("abort", () =>
                    reject(new DOMException("aborted", "AbortError")),
                  );
                }),
            ),
        }),
      },
    })) as typeof fetch;

    await expect(
      fetchDashboardSSERows(input, {
        basePath: "",
        signal: new AbortController().signal,
        onProgress: () => undefined,
        stallTimeoutMs: 30,
      }),
    ).rejects.toThrow(/stalled/);
  });

  it("treats a stream cut before its terminal event as an error, even with rows", async () => {
    const encoder = new TextEncoder();
    global.TextDecoder = TextDecoder as typeof global.TextDecoder;
    let step = 0;
    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn().mockImplementation(async () => {
            if (step === 0) {
              step += 1;
              return {
                done: false,
                value: encoder.encode(
                  'event: row\ndata: {"count_count":42}\n\n',
                ),
              };
            }
            // Clean end without a "done"/"error" event: a cut stream.
            return { done: true, value: undefined };
          }),
        }),
      },
    })) as typeof fetch;

    await expect(
      fetchDashboardSSERows(input, {
        basePath: "",
        signal: new AbortController().signal,
        onProgress: () => undefined,
      }),
    ).rejects.toThrow("Stream ended unexpectedly");
  });
});
