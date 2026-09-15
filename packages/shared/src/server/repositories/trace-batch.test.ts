import { afterEach, describe, expect, it, vi } from "vitest";
import { getTraceBatchEventStream } from "./trace-batch";
import { queryClickhouseStream } from "./clickhouse";

// Exercise the real query builder, intercepting execution before any client loads.
vi.mock("./clickhouse", async () => ({
  TupleParam: (await import("@clickhouse/client")).TupleParam,
  queryClickhouseStream: vi.fn(),
}));
vi.mock("./index", () => ({ clickhouseCompliantRandomCharacters: vi.fn() }));
vi.mock("../clickhouse/client", () => ({
  convertDateToClickhouseDateTime: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("trace batch query controls", () => {
  const traces = Array.from({ length: 2_001 }, (_, index) => ({
    projectId: index % 2 ? "one" : "two",
    traceId: `trace-${index}`,
    minStart: 1_000 + index,
    maxStart: 2_000 + index,
  }));

  it("preserves the default query, transport and settings when overrides are absent", async () => {
    vi.mocked(queryClickhouseStream).mockImplementation(async function* () {});
    for await (const _ of getTraceBatchEventStream({ traces })) {
      throw new Error("Unexpected row");
    }
    const baseline = vi.mocked(queryClickhouseStream).mock.calls[0][0];
    expect(baseline.clickhouseSettings).toEqual({
      max_threads: 1,
      max_execution_time: 30,
      timeout_overflow_mode: "throw",
    });
    expect(baseline.tags).toEqual({ projectId: "MULTI_PROJECT" });
    expect(baseline.useMultipartParamsAuto).toBe(true);
    expect(baseline.clickhouseConfigs).toEqual({
      compression: { response: true },
    });
    expect(baseline.preferredClickhouseService).toBe("EventsReadOnly");

    for await (const _ of getTraceBatchEventStream({ traces }, {})) {
      throw new Error("Unexpected row");
    }
    expect(vi.mocked(queryClickhouseStream).mock.calls[1][0]).toEqual(baseline);
  });

  it("passes controls through chunked and single-project reads without changing membership or buffering rows", async () => {
    const row = { project_id: "one", trace_id: "trace-1" };
    const failure = new Error("stream failed");
    let requestedSecondRow = false;
    vi.mocked(queryClickhouseStream).mockImplementation(async function* () {
      yield row;
      requestedSecondRow = true;
      throw failure;
    });

    for (const members of [traces.slice(1, 2), traces]) {
      const baselineStream = getTraceBatchEventStream({ traces: members });
      await baselineStream.next();
      const baseline = vi.mocked(queryClickhouseStream).mock.lastCall![0];
      await baselineStream.return(undefined);
      for (const maxBlockSize of [undefined, 256, 512, 1_024]) {
        requestedSecondRow = false;
        const stream = getTraceBatchEventStream(
          { traces: members },
          { maxThreads: 2, maxBlockSize, experimentId: "arm-b" },
        );
        expect(await stream.next()).toEqual({ value: row, done: false });
        expect(requestedSecondRow).toBe(false);
        const sent = vi.mocked(queryClickhouseStream).mock.lastCall![0];
        expect(sent).toEqual({
          ...baseline,
          tags: { ...baseline.tags, experimentId: "arm-b" },
          clickhouseSettings: {
            ...baseline.clickhouseSettings,
            max_threads: 2,
            ...(maxBlockSize === undefined
              ? {}
              : { max_block_size: String(maxBlockSize) }),
          },
        });
        if (maxBlockSize === undefined) {
          expect(sent.clickhouseSettings).not.toHaveProperty("max_block_size");
        }
        await expect(stream.next()).rejects.toBe(failure);
      }
    }
  });
});
