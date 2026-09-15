import { randomUUID } from "node:crypto";
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

  it("uses bounded defaults and compressed multipart transport without overrides", async () => {
    vi.mocked(queryClickhouseStream).mockImplementation(async function* () {});
    for await (const _ of getTraceBatchEventStream({ traces })) {
      throw new Error("Unexpected row");
    }
    const baseline = vi.mocked(queryClickhouseStream).mock.calls[0][0];
    expect(baseline.clickhouseSettings).toEqual({
      max_threads: 2,
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

  it("bounds 10,000-trace HTTP parameters for distinct projects and identical windows", async () => {
    vi.mocked(queryClickhouseStream).mockImplementation(async function* () {});
    for (const sharedWindow of [false, true]) {
      const projectId = randomUUID();
      const members = Array.from({ length: 10_000 }, (_, index) => ({
        projectId: sharedWindow ? projectId : randomUUID(),
        traceId: randomUUID(),
        minStart: 1_000 + (sharedWindow ? 0 : index),
        maxStart: 2_000 + (sharedWindow ? 0 : index),
      }));
      for await (const _ of getTraceBatchEventStream({ traces: members })) {
        throw new Error("Unexpected row");
      }
      const sent = vi.mocked(queryClickhouseStream).mock.lastCall![0];
      expect(Buffer.byteLength(sent.query)).toBeLessThan(262_144);
      expect(Object.keys(sent.params ?? {}).length).toBeLessThan(1_000);
      for (const value of Object.values(sent.params ?? {})) {
        // UUID strings require no transport escaping; JSON conservatively includes
        // TupleParam property names that ClickHouse's tuple encoding omits.
        expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThan(131_072);
      }
      const projectLists = Object.entries(sent.params ?? {})
        .filter(([name]) => /^projectIds/.test(name))
        .flatMap(([, ids]) => ids as string[]);
      expect(new Set(projectLists)).toEqual(
        new Set(members.map((t) => t.projectId)),
      );
      const timeTraceLists = Object.entries(sent.params ?? {})
        .filter(([name]) => /^g\d+t$/.test(name))
        .flatMap(([, ids]) => (ids as string[][]).flat());
      expect(new Set(timeTraceLists)).toEqual(
        new Set(members.map((t) => t.traceId)),
      );
    }
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
          { maxThreads: 1, maxBlockSize, experimentId: "arm-b" },
        );
        expect(await stream.next()).toEqual({ value: row, done: false });
        expect(requestedSecondRow).toBe(false);
        const sent = vi.mocked(queryClickhouseStream).mock.lastCall![0];
        expect(sent).toEqual({
          ...baseline,
          tags: { ...baseline.tags, experimentId: "arm-b" },
          clickhouseSettings: {
            ...baseline.clickhouseSettings,
            max_threads: 1,
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
