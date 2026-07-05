import {
  prepareInstanceHealthView,
  prepareMetricPanel,
  sortLedgerRows,
} from "@/src/features/instance-health/lib/prepareInstanceHealthView";
import type {
  InstanceHealthClickHouseMetricPanel,
  InstanceHealthResponse,
} from "@/src/features/instance-health/types";

const baseResponse = {
  overallStatus: "warning",
  generatedAt: "2026-07-05T12:00:00.000Z",
  findings: [],
  topologyNodes: [],
  topologyEdges: [],
  runbookSteps: [],
  ledgerRows: [
    {
      id: "ok",
      area: "web",
      status: "ok",
      signal: "Web",
      currentValue: "served",
      expected: "served",
      lastChecked: "2026-07-05T12:00:00.000Z",
    },
    {
      id: "unavailable",
      area: "worker",
      status: "unavailable",
      signal: "Worker",
      currentValue: "inferred only",
      expected: "direct signal",
      lastChecked: "2026-07-05T12:00:00.000Z",
    },
    {
      id: "error",
      area: "clickhouse",
      status: "error",
      signal: "ClickHouse",
      currentValue: "down",
      expected: "responding",
      lastChecked: "2026-07-05T12:00:00.000Z",
    },
    {
      id: "warning",
      area: "queues",
      status: "warning",
      signal: "Queues",
      currentValue: "backlog",
      expected: "bounded",
      lastChecked: "2026-07-05T12:00:00.000Z",
    },
  ],
  clickhousePanels: {
    summary: [],
    metrics: [
      {
        id: "memory",
        title: "Memory",
        status: "ok",
        current: [],
        history: {
          range: "1h",
          series: [],
          emptyState: "current only",
        },
      },
    ],
    tables: {
      status: "ok",
      rows: [],
    },
  },
  unavailableDiagnostics: [
    {
      id: "worker",
      area: "worker",
      reason: "Direct worker diagnostics are unavailable.",
    },
  ],
} satisfies InstanceHealthResponse;

describe("instance health view preparer", () => {
  it("sorts ledger rows by operator urgency", () => {
    expect(
      sortLedgerRows(baseResponse.ledgerRows).map((row) => row.id),
    ).toEqual(["error", "warning", "unavailable", "ok"]);
  });

  it("filters ledger rows by status and area", () => {
    const prepared = prepareInstanceHealthView(baseResponse, {
      area: "queues",
      status: "warning",
    });

    expect(prepared.ledgerRows.map((row) => row.id)).toEqual(["warning"]);
    expect(prepared.areaOptions).toEqual([
      "clickhouse",
      "queues",
      "web",
      "worker",
    ]);
    expect(prepared.statusOptions).toEqual([
      "error",
      "warning",
      "unavailable",
      "ok",
    ]);
  });

  it("keeps ClickHouse current-only empty states explicit", () => {
    const prepared = prepareInstanceHealthView(baseResponse, {
      area: "all",
      status: "all",
    });

    expect(prepared.clickhousePanels.metrics[0].hasHistory).toBe(false);
    expect(prepared.clickhousePanels.metrics[0].history.emptyState).toBe(
      "current only",
    );
  });

  it("normalizes chart points per panel before rendering", () => {
    const panel = {
      id: "cpu",
      title: "CPU",
      status: "ok",
      current: [],
      history: {
        range: "1h",
        series: [
          {
            id: "cpu:n1",
            node: "n1",
            label: "OSUserTimeNormalized",
            unit: "ratio",
            points: [
              { timestamp: "2026-07-05T11:55:00.000Z", value: 0.25 },
              { timestamp: "2026-07-05T12:00:00.000Z", value: 0.5 },
            ],
          },
        ],
      },
    } satisfies InstanceHealthClickHouseMetricPanel;

    expect(
      prepareMetricPanel(panel).preparedSeries[0].points.map(
        (point) => point.normalizedValue,
      ),
    ).toEqual([0.5, 1]);
  });

  it("prepares numeric operator metrics from diagnostics", () => {
    const prepared = prepareInstanceHealthView(
      {
        ...baseResponse,
        ledgerRows: [
          {
            id: "queues",
            area: "queues",
            status: "warning",
            signal: "BullMQ queue counts",
            currentValue: "1,234 queued, 5 active, 2 failed",
            expected: "bounded",
            lastChecked: "2026-07-05T12:00:00.000Z",
          },
          {
            id: "clickhouse-freshness",
            area: "clickhouse",
            status: "ok",
            signal: "Recent rows",
            currentValue: "traces and observations seen in the last 3 minutes",
            expected: "recent rows",
            lastChecked: "2026-07-05T12:00:00.000Z",
            details: [
              {
                label: "traces",
                value: "recent row present",
                status: "ok",
              },
            ],
          },
        ],
        clickhousePanels: {
          summary: [
            {
              label: "Table metadata",
              value: "20 tables",
              status: "ok",
            },
          ],
          metrics: [
            {
              id: "memory",
              title: "Memory",
              status: "ok",
              current: [{ label: "node-1", value: "1.2 GB", status: "ok" }],
              history: {
                range: "1h",
                series: [
                  {
                    id: "memory:node-1",
                    node: "node-1",
                    label: "MemoryResident",
                    unit: "bytes",
                    points: [
                      {
                        timestamp: "2026-07-05T11:55:00.000Z",
                        value: 100,
                      },
                      {
                        timestamp: "2026-07-05T12:00:00.000Z",
                        value: 200,
                      },
                    ],
                  },
                ],
              },
            },
          ],
          tables: {
            status: "ok",
            rows: [
              {
                node: "node-1",
                database: "default",
                table: "events_full",
                engine: "ReplacingMergeTree",
                rows: "10,000",
                bytes: "25 MB",
                parts: "2",
                status: "ok",
              },
            ],
          },
        },
      },
      { area: "all", status: "all" },
    );

    expect(
      prepared.operatorMetrics.map((metric) => [metric.id, metric.value]),
    ).toEqual([
      ["ingestion-freshness", "3 min window"],
      ["queue-backlog", "1,234"],
      ["queue-failures", "2"],
      ["clickhouse-memory", "1.2 GB"],
      ["largest-table", "25 MB"],
    ]);
    expect(
      prepared.operatorMetrics
        .find((metric) => metric.id === "clickhouse-memory")
        ?.series?.[0].points.map((point) => point.normalizedValue),
    ).toEqual([0.5, 1]);
  });
});
