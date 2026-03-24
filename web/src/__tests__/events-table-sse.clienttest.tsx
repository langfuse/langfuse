import {
  render,
  renderHook,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { TextDecoder, TextEncoder } from "util";
import superjson from "superjson";
import { useSSEEventsTableQuery } from "@/src/features/events/hooks/useSSEEventsTableQuery";
import { EventsTableLoadingState } from "@/src/features/events/components/EventsTableLoadingState";

describe("useSSEEventsTableQuery", () => {
  const originalFetch = global.fetch;
  const originalTextDecoder = global.TextDecoder;

  const createStreamReader = (chunks: Uint8Array[]) => {
    let index = 0;

    return {
      read: jest.fn().mockImplementation(async () => {
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

  const createInput = (page: number) => ({
    projectId: "project-1",
    filter: [],
    searchQuery: null,
    searchType: ["id", "content"] as const,
    orderBy: { column: "startTime", order: "DESC" as const },
    page,
    limit: 50,
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.TextDecoder = originalTextDecoder;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("parses progress and a final superjson result payload", async () => {
    const encoder = new TextEncoder();
    const result = {
      observations: [
        {
          id: "obs-1",
          traceId: "trace-1",
          startTime: new Date("2026-03-24T09:00:00.000Z"),
        },
      ],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () =>
          createStreamReader([
            encoder.encode(
              'event: progress\ndata: {"read_rows":"100","total_rows_to_read":"200","elapsed_ns":"10","read_bytes":"4096"}\n\n' +
                `event: result\ndata: ${JSON.stringify(superjson.serialize(result))}\n\n` +
                "event: done\ndata: {}\n\n",
            ),
          ]),
      },
    }) as typeof fetch;
    global.TextDecoder = TextDecoder as typeof global.TextDecoder;

    const { result: hookResult } = renderHook(() =>
      useSSEEventsTableQuery(createInput(1), {
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(hookResult.current.isSuccess).toBe(true);
    });

    expect(hookResult.current.progress?.percent).toBeCloseTo(0.5);
    expect(hookResult.current.data?.observations[0]?.id).toBe("obs-1");
    expect(hookResult.current.data?.observations[0]?.startTime).toBeInstanceOf(
      Date,
    );
    expect(hookResult.current.isPending).toBe(false);
  });

  it("surfaces resource-limit SSE errors", async () => {
    const encoder = new TextEncoder();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () =>
          createStreamReader([
            encoder.encode(
              'event: error\ndata: {"kind":"resource_limit","message":"Resource limit"}\n\n',
            ),
          ]),
      },
    }) as typeof fetch;
    global.TextDecoder = TextDecoder as typeof global.TextDecoder;

    const { result: hookResult } = renderHook(() =>
      useSSEEventsTableQuery(createInput(1), {
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(hookResult.current.isError).toBe(true);
    });

    expect(hookResult.current.errorKind).toBe("resource_limit");
    expect(hookResult.current.error).toBe("Resource limit");
  });

  it("treats changed inputs as pending immediately and hides stale data", async () => {
    const encoder = new TextEncoder();
    let releaseSecondResponse: (() => void) | null = null;

    global.fetch = jest
      .fn()
      .mockImplementationOnce(async () => ({
        ok: true,
        body: {
          getReader: () =>
            createStreamReader([
              encoder.encode(
                `event: result\ndata: ${JSON.stringify(
                  superjson.serialize({
                    observations: [{ id: "obs-1", startTime: new Date() }],
                  }),
                )}\n\n` + "event: done\ndata: {}\n\n",
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
              read: jest.fn().mockImplementation(async () => {
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

    const { result: hookResult, rerender } = renderHook(
      ({ page }) =>
        useSSEEventsTableQuery(createInput(page), {
          enabled: true,
        }),
      {
        initialProps: { page: 1 },
      },
    );

    await waitFor(() => {
      expect(hookResult.current.isSuccess).toBe(true);
    });

    rerender({ page: 2 });

    expect(hookResult.current.isPending).toBe(true);
    expect(hookResult.current.isLoading).toBe(true);
    expect(hookResult.current.data).toBeUndefined();
    expect(hookResult.current.progress).toBeNull();
    expect(hookResult.current.error).toBeNull();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(releaseSecondResponse).not.toBeNull();
    });

    const release: (() => void) | null = releaseSecondResponse;
    if (release !== null) {
      (release as () => void)();
    }

    await waitFor(() => {
      expect(hookResult.current.isError).toBe(true);
    });
  });
});

describe("EventsTableLoadingState", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows a spinner immediately and progress after a short delay", async () => {
    jest.useFakeTimers();

    render(
      <EventsTableLoadingState
        isLoading
        progress={{
          read_rows: 1500,
          total_rows_to_read: 5000,
          elapsed_ns: 10,
          read_bytes: 4096,
          percent: 0.3,
        }}
      />,
    );

    expect(screen.queryByText(/Reading/i)).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(50);
    });

    expect(screen.getByText(/Reading 2K \/ ~5K rows/i)).not.toBeNull();
  });
});
