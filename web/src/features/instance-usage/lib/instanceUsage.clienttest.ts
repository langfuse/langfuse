import {
  buildInstanceUsageCsv,
  buildMonthlyUsage,
  daysElapsedInMonth,
  resolveUsageEntities,
  type InstanceUsagePartitionRow,
  type InstanceUsageResponse,
} from "./instanceUsage";

const partitionRow = (
  overrides: Partial<InstanceUsagePartitionRow> & {
    table: string;
    month: string;
  },
): InstanceUsagePartitionRow => ({
  rows: 0,
  onDiskBytes: 0,
  uncompressedBytes: 0,
  parts: 1,
  ...overrides,
});

describe("resolveUsageEntities", () => {
  it("keeps legacy tables authoritative in dual mode so units are not doubled", () => {
    expect(resolveUsageEntities("dual").map((e) => e.table)).toEqual([
      "traces",
      "observations",
      "scores",
    ]);
  });

  it("reports spans instead of traces + observations in events_only", () => {
    expect(resolveUsageEntities("events_only").map((e) => e.table)).toEqual([
      "events_core",
      "scores",
    ]);
  });
});

describe("buildMonthlyUsage", () => {
  const now = new Date("2026-08-06T00:00:00Z");

  it("pivots partitions into months, newest first, and marks the partial month", () => {
    const { months } = buildMonthlyUsage({
      partitionRows: [
        partitionRow({ table: "traces", month: "2026-07", rows: 10 }),
        partitionRow({ table: "observations", month: "2026-07", rows: 40 }),
        partitionRow({ table: "scores", month: "2026-07", rows: 2 }),
        partitionRow({ table: "traces", month: "2026-08", rows: 5 }),
      ],
      entities: resolveUsageEntities("legacy"),
      now,
    });

    expect(months.map((m) => m.month)).toEqual(["2026-08", "2026-07"]);
    expect(months[0]).toMatchObject({ isPartial: true, tracingUnits: 5 });
    expect(months[1]).toMatchObject({
      isPartial: false,
      tracingUnits: 52,
      counts: { traces: 10, observations: 40, scores: 2 },
    });
  });

  it("counts events_full bytes toward the month but never toward units", () => {
    const { months, storage } = buildMonthlyUsage({
      partitionRows: [
        partitionRow({
          table: "events_core",
          month: "2026-07",
          rows: 100,
          onDiskBytes: 1_000,
        }),
        partitionRow({
          table: "events_full",
          month: "2026-07",
          rows: 100,
          onDiskBytes: 9_000,
        }),
      ],
      entities: resolveUsageEntities("events_only"),
      now,
    });

    expect(months[0].tracingUnits).toBe(100);
    expect(months[0].onDiskBytes).toBe(10_000);
    expect(storage.map((s) => s.table)).toEqual(["events_core", "events_full"]);
  });

  it("zero-fills entities that have no partitions yet", () => {
    const { months } = buildMonthlyUsage({
      partitionRows: [
        partitionRow({ table: "traces", month: "2026-07", rows: 3 }),
      ],
      entities: resolveUsageEntities("legacy"),
      now,
    });

    expect(months[0].counts).toEqual({
      traces: 3,
      observations: 0,
      scores: 0,
    });
  });

  it("sums parts and partitions per table across months", () => {
    const { storage } = buildMonthlyUsage({
      partitionRows: [
        partitionRow({ table: "traces", month: "2026-07", rows: 3, parts: 4 }),
        partitionRow({ table: "traces", month: "2026-06", rows: 7, parts: 2 }),
      ],
      entities: resolveUsageEntities("legacy"),
      now,
    });

    expect(storage[0]).toMatchObject({
      table: "traces",
      rows: 10,
      parts: 6,
      partitions: 2,
    });
  });
});

describe("daysElapsedInMonth", () => {
  it("uses elapsed days for the current month", () => {
    expect(
      daysElapsedInMonth("2026-08", new Date("2026-08-06T12:00:00Z")),
    ).toBe(6);
  });

  it("uses the full length for past months, including leap February", () => {
    const now = new Date("2026-08-06T00:00:00Z");
    expect(daysElapsedInMonth("2026-07", now)).toBe(31);
    expect(daysElapsedInMonth("2024-02", now)).toBe(29);
    expect(daysElapsedInMonth("2026-02", now)).toBe(28);
  });
});

describe("buildInstanceUsageCsv", () => {
  const data: InstanceUsageResponse = {
    generatedAt: "2026-08-06T10:00:00.000Z",
    instance: {
      dataModel: "legacy",
      organizations: 2,
      projects: 7,
      users: 31,
      projectsWithRetention: 1,
      postgresBytes: 1234,
    },
    entities: resolveUsageEntities("legacy"),
    months: [
      {
        month: "2026-07",
        isPartial: false,
        counts: { traces: 10, observations: 40, scores: 2 },
        tracingUnits: 52,
        onDiskBytes: 500,
        uncompressedBytes: 5_000,
      },
    ],
    storage: [],
    warnings: [],
  };

  it("emits the preamble, a blank line, then the monthly table", () => {
    const csv = buildInstanceUsageCsv({
      data,
      version: "4.6.0",
      now: new Date("2026-08-06T10:00:00Z"),
    });
    const lines = csv.split("\n");

    expect(lines[0]).toBe("Key,Value");
    expect(lines).toContain("Langfuse version,4.6.0");
    expect(lines[lines.indexOf("") + 1]).toBe(
      "Month,Traces,Observations,Scores,Tracing units,Avg tracing units per day,ClickHouse on disk (bytes),ClickHouse uncompressed (bytes),Month complete",
    );
    // 52 units over July's 31 days rounds to 2.
    expect(lines.at(-1)).toBe("2026-07,10,40,2,52,2,500,5000,yes");
  });

  it("quotes values that contain a comma", () => {
    const csv = buildInstanceUsageCsv({
      data: {
        ...data,
        entities: [{ key: "traces", label: "Traces, all", table: "traces" }],
      },
      version: "4.6.0",
      now: new Date("2026-08-06T10:00:00Z"),
    });

    expect(csv).toContain('"Traces, all"');
  });
});
