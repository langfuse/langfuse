/**
 * Routing regression tests for the batch export read path.
 *
 * Observation seam: this file redirects the three ClickHouse service URLs
 * (`CLICKHOUSE_URL`, `CLICKHOUSE_READ_ONLY_URL`, `CLICKHOUSE_EVENTS_READ_ONLY_URL`)
 * at recording HTTP pass-through proxies in front of the single local
 * ClickHouse, before the shared env module is parsed. Every query therefore
 * records which *cluster* it was sent to, independent of how routing is
 * implemented (explicit `preferredClickhouseService` argument, ambient context,
 * or anything else).
 *
 * The URL rewrite is process-wide for this file, which is why these tests live
 * next to `batchExport.test.ts` instead of inside it: routing every query of
 * that suite through a proxy would slow it down and add failure modes to tests
 * that do not care about routing.
 *
 * Two cheaper seams were tried and rejected, empirically:
 *  - Mutating the shared `env` object at runtime is a no-op. A test's
 *    `@langfuse/shared/src/env` import and the built shared code's own `env`
 *    import are different module instances, so an override never reaches the
 *    ClickHouse client. Rewriting `process.env` inside `vi.hoisted()` works
 *    because it runs before the shared env module is parsed.
 *  - Mocking `queryClickhouse` / `queryClickhouseStream` on the
 *    `@langfuse/shared/src/server` barrel only intercepts calls made by worker
 *    code. It cannot see the queries issued inside shared itself (score names,
 *    the scores/sessions/dataset-run-items table services), which is where most
 *    of the routing under test happens.
 *
 * The non-events export paths must land on the read-only service specifically:
 * `EventsReadOnly` is reserved for the events-table export, which is out of
 * scope here, so a query arriving on the events replica is as much a failure as
 * one arriving on the primary writer.
 */
import http from "http";
import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const upstream = new URL(process.env.CLICKHOUSE_URL as string);
  // Distinct ports per run: several test files execute in parallel processes.
  const base = 21000 + Math.floor(Math.random() * 1000) * 4;
  const ports = {
    primary: base,
    readOnly: base + 1,
    eventsReadOnly: base + 2,
  };
  process.env.CLICKHOUSE_URL = `http://127.0.0.1:${ports.primary}`;
  process.env.CLICKHOUSE_READ_ONLY_URL = `http://127.0.0.1:${ports.readOnly}`;
  process.env.CLICKHOUSE_EVENTS_READ_ONLY_URL = `http://127.0.0.1:${ports.eventsReadOnly}`;
  // Mirrors batchExport.test.ts so the dataset run items export reads the
  // versioned (ClickHouse) implementation.
  process.env.LANGFUSE_DATASET_SERVICE_READ_FROM_VERSIONED_IMPLEMENTATION =
    "true";
  process.env.LANGFUSE_DATASET_SERVICE_WRITE_TO_VERSIONED_IMPLEMENTATION =
    "true";

  return {
    upstreamHost: upstream.hostname,
    upstreamPort: Number(upstream.port || 8123),
    ports,
    requests: {
      primary: [] as string[],
      readOnly: [] as string[],
      eventsReadOnly: [] as string[],
    },
  };
});

const {
  createDatasetRunItem,
  createDatasetRunItemsCh,
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createScoresCh,
  createTrace,
  createTraceScore,
  createTracesCh,
  getDatasetRunItemsCh,
  getDistinctScoreNames,
  getScoresUiTable,
  getSessionsTable,
  queryClickhouse,
} = await import("@langfuse/shared/src/server");
const { prisma } = await import("@langfuse/shared/src/db");
const { BatchExportFileFormat, BatchExportStatus, BatchExportTableName } =
  await import("@langfuse/shared");
const { handleBatchExportJob } =
  await import("../features/batchExport/handleBatchExportJob");
const { getDatabaseReadStreamPaginated } =
  await import("../features/database-read-stream/getDatabaseReadStream");
const { getObservationStream } =
  await import("../features/database-read-stream/observation-stream");
const { getTraceStream } =
  await import("../features/database-read-stream/trace-stream");

const startRecordingProxy = (port: number, sink: string[]) =>
  new Promise<http.Server>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        sink.push(`${req.method} ${req.url} ${body}`);
        const headers = { ...req.headers };
        delete headers.host;
        delete headers["content-length"];
        const upstreamReq = http.request(
          {
            host: harness.upstreamHost,
            port: harness.upstreamPort,
            method: req.method,
            path: req.url,
            headers,
          },
          (upstreamRes) => {
            res.writeHead(upstreamRes.statusCode ?? 500, upstreamRes.headers);
            upstreamRes.pipe(res);
          },
        );
        upstreamReq.on("error", (error) => {
          res.writeHead(502);
          res.end(String(error));
        });
        upstreamReq.end(body);
      });
    });
    server.timeout = 0;
    server.requestTimeout = 0;
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });

let servers: http.Server[] = [];

const resetRecordings = () => {
  harness.requests.primary.length = 0;
  harness.requests.readOnly.length = 0;
  harness.requests.eventsReadOnly.length = 0;
};

const replicaRequests = () => [
  ...harness.requests.readOnly,
  ...harness.requests.eventsReadOnly,
];

/** Compact failure messages: which SQL statements reached a given service. */
const recordedQueries = (sink: string[]) =>
  sink.map((request) =>
    (request.split(" ").slice(2).join(" ") || request)
      .replace(/\s+/g, " ")
      .slice(0, 200),
  );

const primaryQueries = () => recordedQueries(harness.requests.primary);

/**
 * Queries that reached the events read replica. Legitimate for the events-table
 * export (out of scope here), a routing failure for every path under test.
 */
const eventsReplicaQueries = () =>
  recordedQueries(harness.requests.eventsReadOnly);

/**
 * Mirrors the stream selection *and argument list* `handleBatchExportJob` uses
 * per table, so the sweep exercises the code an actual export runs. The service
 * value is the one the job passes; the paginated reader and the observation
 * stream deliberately default to the writer when it is absent, so that batch
 * *actions* — which enumerate a selection the user made against the primary —
 * are unaffected. Whether the job itself still passes it is covered separately
 * by the end-to-end tests further down, which drive the job for real.
 */
const openExportStream = async (
  tableName: (typeof CLICKHOUSE_BACKED_EXPORT_TABLES)[number],
): Promise<AsyncIterable<unknown>> => {
  switch (tableName) {
    // The traces stream pins its own service and takes no option from the job.
    case BatchExportTableName.Traces:
      return getTraceStream({ projectId, cutoffCreatedAt, filter: [] });
    case BatchExportTableName.Observations:
      return getObservationStream({
        projectId,
        cutoffCreatedAt,
        filter: [],
        preferredClickhouseService: EXPORT_CLICKHOUSE_SERVICE,
      });
    default:
      return getDatabaseReadStreamPaginated({
        projectId,
        tableName,
        cutoffCreatedAt,
        filter: [],
        orderBy: EXPORT_ORDER_BY[tableName],
        preferredClickhouseService: EXPORT_CLICKHOUSE_SERVICE,
      });
  }
};

const drain = async (stream: AsyncIterable<unknown>) => {
  const rows: any[] = [];
  for await (const row of stream) rows.push(row);
  return rows;
};

const cutoffCreatedAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

/** Export tables whose rows are read from ClickHouse on the export path. */
const CLICKHOUSE_BACKED_EXPORT_TABLES = [
  BatchExportTableName.Traces,
  BatchExportTableName.Observations,
  BatchExportTableName.Scores,
  BatchExportTableName.Sessions,
  BatchExportTableName.DatasetRunItems,
] as const;

/** Tables deliberately outside the sweep, with the reason they are exempt. */
const EXPORT_TABLES_EXEMPT_FROM_ROUTING_SWEEP: Record<string, string> = {
  [BatchExportTableName.Datasets]:
    "no case in getDatabaseReadStreamPaginated; reachable only as a batch action",
  [BatchExportTableName.DatasetItems]: "Postgres/Prisma only",
  [BatchExportTableName.AuditLogs]: "Postgres/Prisma only",
  [BatchExportTableName.Events]:
    "events export already targets the events read replica",
};

/**
 * The service a batch export reads from. Duplicated from the job's own private
 * constant on purpose: this is the spec's value, so the test fails if the job
 * ever drifts to a different service rather than following it silently.
 */
const EXPORT_CLICKHOUSE_SERVICE = "ReadOnly" as const;

/** Per-table sort column accepted by the export query for that table. */
const EXPORT_ORDER_BY: Record<string, { column: string; order: "DESC" }> = {
  [BatchExportTableName.Scores]: { column: "timestamp", order: "DESC" },
  [BatchExportTableName.Sessions]: { column: "createdAt", order: "DESC" },
  [BatchExportTableName.DatasetRunItems]: {
    column: "createdAt",
    order: "DESC",
  },
};

const EXPECTED_EXPORT_ROW_COUNT: Record<string, number> = {
  [BatchExportTableName.Traces]: 2,
  [BatchExportTableName.Observations]: 2,
  [BatchExportTableName.Scores]: 2,
  [BatchExportTableName.Sessions]: 2,
  [BatchExportTableName.DatasetRunItems]: 1,
};

let projectId: string;
let traceIds: string[];
let sessionIds: string[];

beforeAll(async () => {
  servers = await Promise.all([
    startRecordingProxy(harness.ports.primary, harness.requests.primary),
    startRecordingProxy(harness.ports.readOnly, harness.requests.readOnly),
    startRecordingProxy(
      harness.ports.eventsReadOnly,
      harness.requests.eventsReadOnly,
    ),
  ]);

  ({ projectId } = await createOrgProjectAndApiKey());

  sessionIds = [randomUUID(), randomUUID()];
  await prisma.traceSession.createMany({
    data: sessionIds.map((id) => ({ id, projectId })),
  });

  traceIds = [randomUUID(), randomUUID()];
  await createTracesCh(
    traceIds.map((id, index) =>
      createTrace({
        project_id: projectId,
        id,
        session_id: sessionIds[index],
      }),
    ),
  );

  await createObservationsCh(
    traceIds.map((traceId) =>
      createObservation({ project_id: projectId, trace_id: traceId }),
    ),
  );

  // Named score: the export flattens one column per distinct score name, so its
  // presence in an exported row proves the distinct-score-names query ran.
  await createScoresCh(
    traceIds.map((traceId) =>
      createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        name: "quality",
        value: 1,
        observation_id: null,
      }),
    ),
  );

  // Dataset run items are seeded in ClickHouse only: the export reads them from
  // ClickHouse and looks up dataset names in Postgres, which tolerates a
  // missing dataset row.
  await createDatasetRunItemsCh([
    createDatasetRunItem({
      id: randomUUID(),
      project_id: projectId,
      dataset_id: randomUUID(),
      dataset_run_id: randomUUID(),
      dataset_item_id: randomUUID(),
      trace_id: traceIds[0],
    }),
  ]);
}, 120_000);

afterAll(async () => {
  await Promise.all(
    servers.map((s) => new Promise<void>((r) => s.close(() => r()))),
  );
});

describe("batch export read replica routing", () => {
  // Load-bearing: without these two controls a green "no primary traffic"
  // assertion could just mean the harness never observed anything.
  describe("harness controls", () => {
    it("records a default-routed query on the primary writer only", async () => {
      resetRecordings();

      const rows = await queryClickhouse<{ x: number }>({
        query: "SELECT 1 AS x",
        params: {},
        tags: {},
      });

      expect(rows).toHaveLength(1);
      expect(harness.requests.primary.length).toBeGreaterThan(0);
      expect(replicaRequests()).toEqual([]);
    });

    it("records a read-replica-routed query on the replica only", async () => {
      resetRecordings();

      const rows = await queryClickhouse<{ x: number }>({
        query: "SELECT 1 AS x",
        params: {},
        tags: {},
        preferredClickhouseService: "ReadOnly",
      });

      expect(rows).toHaveLength(1);
      expect(primaryQueries()).toEqual([]);
      expect(harness.requests.readOnly.length).toBeGreaterThan(0);
    });
  });

  // AC3 + AC1 (call sites 1 and 2): a traces export must send every query to
  // the read-only replica — neither the main traces+scores query nor the
  // distinct-score-names query that builds the score columns may leave it.
  describe("AC3 — traces export", () => {
    it("sends every query to the read-only replica", async () => {
      resetRecordings();

      const rows = await drain(
        await getTraceStream({ projectId, cutoffCreatedAt, filter: [] }),
      );

      expect(rows).toHaveLength(2);
      // Proves the distinct-score-names query (call site 2) participated.
      expect(Object.keys(rows[0])).toContain("quality");
      expect(primaryQueries()).toEqual([]);
      expect(eventsReplicaQueries()).toEqual([]);
      expect(harness.requests.readOnly.length).toBeGreaterThan(0);
    });
  });

  // AC1 (call sites 3-6) plus AC4: every ClickHouse-backed export table is
  // driven through the same stream selection the batch export job performs, so
  // adding a table to the enum without a routing decision fails here rather
  // than silently reading from the writer in production.
  describe("AC1 — every ClickHouse-backed export path", () => {
    it("no export table escapes the routing sweep", () => {
      expect(
        [
          ...CLICKHOUSE_BACKED_EXPORT_TABLES,
          ...Object.keys(EXPORT_TABLES_EXEMPT_FROM_ROUTING_SWEEP),
        ].sort(),
      ).toEqual(Object.values(BatchExportTableName).sort());
    });

    it.each(CLICKHOUSE_BACKED_EXPORT_TABLES)(
      "%s export sends every query to the read-only replica",
      async (tableName) => {
        resetRecordings();

        const rows = await drain(await openExportStream(tableName));

        // Guards against a vacuous pass: the export really did read rows.
        expect(rows).toHaveLength(EXPECTED_EXPORT_ROW_COUNT[tableName]);
        expect(primaryQueries()).toEqual([]);
        expect(eventsReplicaQueries()).toEqual([]);
        expect(harness.requests.readOnly.length).toBeGreaterThan(0);
      },
    );
  });

  // AC3 + AC4, end to end: the sweep above passes the export service itself, so
  // it cannot see the job forgetting to pass it. These drive the real job entry
  // point from a persisted batch export row, which is the only check that the
  // wiring at the choke point survives.
  describe("AC3 — the batch export job itself", () => {
    const runExportJob = async (
      tableName: string,
      orderBy: { column: string; order: "DESC" } | null,
    ) => {
      const batchExport = await prisma.batchExport.create({
        data: {
          projectId,
          userId: randomUUID(),
          name: `routing-${tableName}`,
          status: BatchExportStatus.QUEUED,
          format: BatchExportFileFormat.JSONL,
          query: { tableName, filter: [], orderBy },
        },
      });

      resetRecordings();

      // The job uploads the export to object storage after reading, which is
      // not available here. Reads are what this asserts, so a later failure is
      // tolerated — an early failure is still caught, because a job that threw
      // before reading leaves the read-only sink empty.
      await handleBatchExportJob({
        projectId,
        batchExportId: batchExport.id,
      }).catch(() => undefined);
    };

    it("reads only from the read-only replica for a traces export", async () => {
      await runExportJob(BatchExportTableName.Traces, null);

      expect(primaryQueries()).toEqual([]);
      expect(eventsReplicaQueries()).toEqual([]);
      expect(harness.requests.readOnly.length).toBeGreaterThan(0);
    });

    it("reads only from the read-only replica for a scores export", async () => {
      await runExportJob(BatchExportTableName.Scores, {
        column: "timestamp",
        order: "DESC",
      });

      expect(primaryQueries()).toEqual([]);
      expect(eventsReplicaQueries()).toEqual([]);
      expect(harness.requests.readOnly.length).toBeGreaterThan(0);
    });
  });

  // AC2: the same shared functions, called the way a UI/API request calls them
  // (no export in progress, no explicit service), must still hit the primary.
  // These guard against pushing the replica default down into the leaves.
  describe("AC2 — non-export callers keep reading the primary", () => {
    it("getDistinctScoreNames reads the primary", async () => {
      resetRecordings();

      await getDistinctScoreNames({
        projectId,
        cutoffCreatedAt,
        startTimeFrom: null,
      });

      expect(harness.requests.primary.length).toBeGreaterThan(0);
      expect(replicaRequests()).toEqual([]);
    });

    it("getScoresUiTable reads the primary", async () => {
      resetRecordings();

      await getScoresUiTable({
        projectId,
        filter: [],
        orderBy: null,
        limit: 10,
        offset: 0,
      });

      expect(harness.requests.primary.length).toBeGreaterThan(0);
      expect(replicaRequests()).toEqual([]);
    });

    it("getSessionsTable reads the primary", async () => {
      resetRecordings();

      await getSessionsTable({ projectId, filter: [], limit: 10, page: 0 });

      expect(harness.requests.primary.length).toBeGreaterThan(0);
      expect(replicaRequests()).toEqual([]);
    });

    it("getDatasetRunItemsCh reads the primary", async () => {
      resetRecordings();

      await getDatasetRunItemsCh({
        projectId,
        filter: [],
        limit: 10,
        offset: 0,
      });

      expect(harness.requests.primary.length).toBeGreaterThan(0);
      expect(replicaRequests()).toEqual([]);
    });
  });
});
