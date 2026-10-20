import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  recordOutcome: vi.fn(),
  recordElapsed: vi.fn(),
}));

vi.mock("../clickhouse/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../clickhouse/client")>()),
  clickhouseClient: () => ({ query: mocks.query }),
}));

vi.mock("../clickhouse/queryOutcome", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../clickhouse/queryOutcome")>()),
  recordClickHouseQueryOutcome: mocks.recordOutcome,
  recordClickHouseQueryElapsed: mocks.recordElapsed,
}));

import {
  ClickHouseQueryAbortedError,
  isProgressRow,
  isRow,
  queryClickhouseWithProgress,
} from "./clickhouse";

function response(
  events: unknown[],
  responseHeaders: Record<string, string> = {},
  afterStream?: () => void,
) {
  return {
    query_id: "query-id",
    response_headers: responseHeaders,
    stream: async function* () {
      yield events.map((event) => ({ json: () => event }));
      afterStream?.();
    },
  };
}

async function collect<T>(
  opts: Parameters<typeof queryClickhouseWithProgress<T>>[0],
) {
  const events: unknown[] = [];
  for await (const event of queryClickhouseWithProgress<T>(opts)) {
    events.push(event);
  }
  return events;
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.recordOutcome.mockReset();
  mocks.recordElapsed.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("queryClickhouseWithProgress", () => {
  it("retries a transient failure before the first data row", async () => {
    mocks.query
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(
        response([
          { progress: { read_rows: "2", read_bytes: "20", elapsed_ns: "1" } },
          { row: { id: "row-1" } },
        ]),
      );

    const events = await collect({ query: "SELECT 1" });

    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(events.filter((event) => isRow(event))).toEqual([
      { row: { id: "row-1" } },
    ]);
  });

  it.each([
    ["10", "13"],
    ["0", "0"],
    [undefined, undefined],
  ])("preserves progress totals on retry: %s", async (total, retriedTotal) => {
    mocks.query
      .mockResolvedValueOnce(
        response(
          [
            {
              progress: {
                read_rows: "3",
                read_bytes: "30",
                elapsed_ns: "10",
                total_rows_to_read: total,
              },
            },
          ],
          {},
          () => {
            throw new Error("connection reset");
          },
        ),
      )
      .mockResolvedValueOnce(
        response([
          {
            progress: {
              read_rows: "8",
              read_bytes: "80",
              elapsed_ns: "20",
              total_rows_to_read: total,
            },
          },
          { row: { id: "row-1" } },
        ]),
      );

    const events = await collect({ query: "SELECT 1" });

    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(
      events
        .filter((event) => isProgressRow(event))
        .map((event) => event.progress),
    ).toEqual([
      {
        read_rows: "3",
        read_bytes: "30",
        elapsed_ns: "10",
        total_rows_to_read: total,
      },
      {
        read_rows: "11",
        read_bytes: "110",
        elapsed_ns: "30",
        total_rows_to_read: retriedTotal,
      },
    ]);
  });

  it.each([1, 3])(
    "honors abort with %i buffered rows, including at EOF",
    async (count) => {
      const controller = new AbortController();
      mocks.query.mockResolvedValueOnce(
        response(Array.from({ length: count }, (_, id) => ({ row: { id } }))),
      );
      const stream = queryClickhouseWithProgress({
        query: "SELECT 1",
        abortSignal: controller.signal,
      });
      expect((await stream.next()).value).toEqual({ row: { id: 0 } });
      controller.abort();
      await expect(stream.next()).rejects.toBeInstanceOf(
        ClickHouseQueryAbortedError,
      );
      expect(mocks.query).toHaveBeenCalledOnce();
      expect(mocks.recordOutcome).toHaveBeenCalledOnce();
      expect(mocks.recordOutcome.mock.calls[0][0]).toBe("cancelled");
      expect(mocks.recordElapsed).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ row: { id: "row-1" } }, "cancelled"],
    [{ exception: "Code: 159. DB::Exception: Timeout exceeded" }, "timeout"],
  ])("counts early consumer closure once: %j", async (event, outcome) => {
    mocks.query.mockResolvedValueOnce(response([event]));
    const stream = queryClickhouseWithProgress({ query: "SELECT 1" });
    await stream.next();
    await stream.return(undefined);
    expect(mocks.recordOutcome).toHaveBeenCalledOnce();
    expect(mocks.recordOutcome.mock.calls[0][0]).toBe(outcome);
    expect(mocks.recordElapsed).not.toHaveBeenCalled();
  });

  it("does not retry after the first data row has been emitted", async () => {
    mocks.query.mockResolvedValueOnce(
      response([{ row: { id: "row-1" } }], {}, () => {
        throw new Error("socket hang up");
      }),
    );

    await expect(collect({ query: "SELECT 1" })).rejects.toThrow(
      "socket hang up",
    );
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("does not retry an aborted request", async () => {
    const abortController = new AbortController();
    mocks.query.mockResolvedValueOnce(
      response(
        [{ progress: { read_rows: "3", read_bytes: "30", elapsed_ns: "1" } }],
        {},
        () => {
          abortController.abort();
          throw new Error("socket hang up");
        },
      ),
    );

    await expect(
      collect({ query: "SELECT 1", abortSignal: abortController.signal }),
    ).rejects.toBeInstanceOf(ClickHouseQueryAbortedError);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("records one successful outcome and the response elapsed time", async () => {
    mocks.query.mockResolvedValueOnce(
      response([{ row: { id: "row-1" } }], {
        "x-clickhouse-summary": JSON.stringify({ elapsed_ns: "1000000" }),
      }),
    );

    await collect({
      query: "SELECT 1",
      tags: { surface: "publicapi", projectId: "project-1" },
      preferredClickhouseService: "EventsReadOnly",
    });

    expect(mocks.recordOutcome).toHaveBeenCalledOnce();
    expect(mocks.recordOutcome.mock.calls[0][0]).toBe("success");
    expect(mocks.recordElapsed).toHaveBeenCalledOnce();
    expect(mocks.recordElapsed.mock.calls[0][0]).toEqual({
      elapsed_ns: "1000000",
    });
  });

  it.each([false, true])(
    "records an exception frame once when followed by abort: %s",
    async (abortAfterException) => {
      const controller = new AbortController();
      mocks.query.mockResolvedValueOnce(
        response(
          [{ exception: "Code: 159. DB::Exception: Timeout exceeded" }],
          {},
          () => {
            if (abortAfterException) {
              controller.abort();
              throw new Error("socket hang up");
            }
          },
        ),
      );

      const result = collect({
        query: "SELECT 1",
        abortSignal: controller.signal,
      });
      if (abortAfterException) {
        await expect(result).rejects.toBeInstanceOf(
          ClickHouseQueryAbortedError,
        );
      } else {
        await result;
      }

      expect(mocks.query).toHaveBeenCalledOnce();
      expect(mocks.recordOutcome).toHaveBeenCalledOnce();
      expect(mocks.recordOutcome.mock.calls[0][0]).toBe("timeout");
      expect(mocks.recordElapsed).not.toHaveBeenCalled();
    },
  );
});
