/**
 * ClickHouse service routing for the batch export read path, observed by
 * pointing each service URL at a recording proxy before the shared env module
 * is parsed. Two things this rules out: mutating the shared `env` object at
 * runtime is a no-op (the test and the built shared code hold different module
 * instances), and mocking `queryClickhouse` on the shared barrel cannot see the
 * queries `shared` issues internally.
 */
import http from "http";
import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const upstream = new URL(process.env.CLICKHOUSE_URL as string);
  const base = 21000 + Math.floor(Math.random() * 1000) * 4;
  const ports = { primary: base, readOnly: base + 1, eventsReadOnly: base + 2 };
  process.env.CLICKHOUSE_URL = `http://127.0.0.1:${ports.primary}`;
  process.env.CLICKHOUSE_READ_ONLY_URL = `http://127.0.0.1:${ports.readOnly}`;
  process.env.CLICKHOUSE_EVENTS_READ_ONLY_URL = `http://127.0.0.1:${ports.eventsReadOnly}`;

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
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createScoresCh,
  createTrace,
  createTraceScore,
  createTracesCh,
  queryClickhouse,
} = await import("@langfuse/shared/src/server");
const { BatchExportTableName } = await import("@langfuse/shared");
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
        sink.push(body.replace(/\s+/g, " ").slice(0, 120));
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

const resetRecordings = () =>
  Object.values(harness.requests).forEach((sink) => (sink.length = 0));

const servicesUsed = () =>
  Object.entries(harness.requests)
    .filter(([, sink]) => sink.length > 0)
    .map(([service]) => service);

const replicaQueries = () => [
  ...harness.requests.readOnly,
  ...harness.requests.eventsReadOnly,
];

const drain = async (stream: AsyncIterable<unknown>) => {
  const rows: any[] = [];
  for await (const row of stream) rows.push(row);
  return rows;
};

const cutoffCreatedAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
const scoreName = "quality";

let projectId: string;

beforeAll(async () => {
  servers = await Promise.all(
    Object.entries(harness.ports).map(([service, port]) =>
      startRecordingProxy(
        port,
        harness.requests[service as keyof typeof harness.requests],
      ),
    ),
  );

  ({ projectId } = await createOrgProjectAndApiKey());

  const traceId = randomUUID();
  await createTracesCh([createTrace({ project_id: projectId, id: traceId })]);
  await createObservationsCh([
    createObservation({ project_id: projectId, trace_id: traceId }),
  ]);
  await createScoresCh([
    createTraceScore({
      project_id: projectId,
      trace_id: traceId,
      name: scoreName,
      value: 1,
      observation_id: null,
    }),
  ]);
}, 120_000);

afterAll(async () => {
  await Promise.all(
    servers.map((s) => new Promise<void>((r) => s.close(() => r()))),
  );
});

describe("batch export ClickHouse routing", () => {
  it("records each service on its own sink", async () => {
    resetRecordings();

    for (const preferredClickhouseService of [
      undefined,
      "ReadOnly",
      "EventsReadOnly",
    ] as const) {
      await queryClickhouse({
        query: "SELECT 1 AS x",
        params: {},
        tags: {},
        preferredClickhouseService,
      });
    }

    expect(servicesUsed()).toEqual(["primary", "readOnly", "eventsReadOnly"]);
  });

  // A score whose name is missing from the name list is dropped from the row, so
  // a name read that lags behind the value read silently removes a whole column
  // from the export. Both reads must therefore resolve to the same service,
  // whichever one that is.
  it.each([
    [
      "traces",
      () => getTraceStream({ projectId, cutoffCreatedAt, filter: [] }),
    ],
    [
      "observations",
      () =>
        getObservationStream({
          projectId,
          cutoffCreatedAt,
          filter: [],
          preferredClickhouseService: "ReadOnly",
        }),
    ],
  ])(
    "%s export reads score names and values from one service",
    async (_, openStream) => {
      resetRecordings();

      const rows = await drain(await openStream());

      expect(Object.keys(rows[0])).toContain(scoreName);
      expect(servicesUsed()).toHaveLength(1);
    },
  );

  // Batch actions call these two with no service to enumerate a selection the
  // user made against the primary. A replica default would make "add all to
  // dataset" silently act on fewer rows than the user selected.
  it.each([
    [
      "getObservationStream",
      () => getObservationStream({ projectId, cutoffCreatedAt, filter: [] }),
    ],
    [
      "getDatabaseReadStreamPaginated",
      () =>
        getDatabaseReadStreamPaginated({
          projectId,
          tableName: BatchExportTableName.Scores,
          cutoffCreatedAt,
          filter: [],
          orderBy: { column: "timestamp", order: "DESC" },
        }),
    ],
  ])("%s reads the primary when passed no service", async (_, openStream) => {
    resetRecordings();

    await drain(await openStream());

    expect(replicaQueries()).toEqual([]);
    expect(harness.requests.primary.length).toBeGreaterThan(0);
  });
});
