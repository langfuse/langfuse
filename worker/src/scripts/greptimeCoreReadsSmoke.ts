/**
 * Product-semantic gate for the 04 P1 GreptimeDB core reads.
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimeCoreReadsSmoke.ts
 *
 * Seeds a fixed edge-case dataset into GreptimeDB through the REAL production write path
 * (IngestionService.mergeAndWrite with rebuildFromHistory), then calls the new GreptimeDB read
 * functions and asserts the returned DOMAIN objects directly — GreptimeDB is the source of truth, so
 * the gate is product semantics, not ClickHouse parity. Covers the P0c edge cases: metadata key
 * collision, same id across two projects, same-timestamp tie, deleted entity, custom usage keys.
 */
import {
  redis,
  clickhouseClient,
  greptimeQuery,
  closeGreptimeConnections,
  greptimeTraceReads,
  greptimeObservationReads,
  greptimeScoreReads,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { ClickhouseWriter } from "../services/ClickhouseWriter";
import { GreptimeWriter } from "../services/GreptimeWriter";
import { IngestionService } from "../services/IngestionService";

const A = `core-A-${Date.now()}`;
const B = `core-B-${Date.now()}`;
const SHARED_TRACE = `t-shared-${Date.now()}`; // same id in A and B (collision test)
const T1 = `t1-${Date.now()}`;
const T2_DELETED = `t2-del-${Date.now()}`;
const O1 = `o1-${Date.now()}`;
const S_NUM = `s-num-${Date.now()}`;
const S_CAT = `s-cat-${Date.now()}`;

const TS = "2026-06-10T08:00:00.000Z";
const TS_TIE = "2026-06-10T08:00:00.000Z"; // identical to TS for the same-timestamp tie

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!redis) throw new Error("redis unavailable");
  if (!prisma) throw new Error("prisma unavailable");

  const svc = new IngestionService(
    redis,
    prisma,
    ClickhouseWriter.getInstance(),
    clickhouseClient(),
    GreptimeWriter.getInstance(),
    /* rebuildFromHistory */ true,
  );
  const writer = GreptimeWriter.getInstance();
  const created = new Date(TS);

  const traceEvent = (
    id: string,
    project: string,
    body: Record<string, unknown>,
  ) => ({
    id: `evt-${id}-${project}`,
    type: "trace-create",
    timestamp: (body.timestamp as string) ?? TS,
    body: { id, environment: "default", ...body },
  });

  // T1 in A — full payload.
  await svc.mergeAndWrite(
    "trace",
    A,
    T1,
    created,
    [
      // No sessionId: the session upsert needs a real Postgres project; this smoke seeds
      // GreptimeDB only. sessionId column mapping is covered by the converter unit test.
      traceEvent(T1, A, {
        name: "alpha",
        timestamp: TS,
        userId: "user-1",
        metadata: { env: "prod", shared: "x" },
        tags: ["a", "b"],
        input: "hello",
        output: "world",
      }),
    ] as never,
    false,
  );

  // Same trace id in A and B — different metadata; reads must not leak across projects.
  await svc.mergeAndWrite(
    "trace",
    A,
    SHARED_TRACE,
    created,
    [
      traceEvent(SHARED_TRACE, A, {
        name: "shared-A",
        timestamp: TS,
        metadata: { tenant: "A" },
      }),
    ] as never,
    false,
  );
  await svc.mergeAndWrite(
    "trace",
    B,
    SHARED_TRACE,
    created,
    [
      traceEvent(SHARED_TRACE, B, {
        name: "shared-B",
        timestamp: TS,
        metadata: { tenant: "B" },
      }),
    ] as never,
    false,
  );

  // T2 deleted — must be excluded from reads.
  await svc.mergeAndWrite(
    "trace",
    A,
    T2_DELETED,
    created,
    [traceEvent(T2_DELETED, A, { name: "ghost", timestamp: TS_TIE })] as never,
    false,
    /* deleted */ true,
  );

  // Observation under T1.
  await svc.mergeAndWrite(
    "observation",
    A,
    O1,
    created,
    [
      {
        id: `evt-${O1}`,
        type: "generation-create",
        timestamp: TS,
        body: {
          id: O1,
          traceId: T1,
          name: "gen-1",
          type: "GENERATION",
          startTime: TS,
          endTime: "2026-06-10T08:00:03.000Z",
          model: "gpt-x",
          environment: "default",
          usageDetails: { input: 10, output: 20, total: 30, custom_key: 7 },
          costDetails: { input: 0.1, output: 0.2, total: 0.3 },
          input: "q",
          output: "a",
        },
      },
    ] as never,
    false,
  );

  // Scores under T1: numeric + categorical.
  await svc.mergeAndWrite(
    "score",
    A,
    S_NUM,
    created,
    [
      {
        id: `evt-${S_NUM}`,
        type: "score-create",
        timestamp: TS,
        body: {
          id: S_NUM,
          traceId: T1,
          name: "accuracy",
          value: 0.9,
          dataType: "NUMERIC",
          source: "EVAL",
          environment: "default",
        },
      },
    ] as never,
    false,
  );
  await svc.mergeAndWrite(
    "score",
    A,
    S_CAT,
    created,
    [
      {
        id: `evt-${S_CAT}`,
        type: "score-create",
        timestamp: TS,
        body: {
          id: S_CAT,
          traceId: T1,
          name: "sentiment",
          value: "good",
          dataType: "CATEGORICAL",
          source: "API",
          environment: "default",
        },
      },
    ] as never,
    false,
  );

  await writer.flushAll(true);
  await sleep(800);

  // -------------------------------------------------------------------------
  // traces
  // -------------------------------------------------------------------------
  const t1 = await greptimeTraceReads.getTracesByIds([T1], A);
  check("getTracesByIds returns the trace", t1.length === 1, t1.length);
  check(
    "trace name/userId mapped",
    t1[0]?.name === "alpha" && t1[0]?.userId === "user-1",
    t1[0],
  );
  check(
    "trace metadata parsed",
    JSON.stringify(t1[0]?.metadata) ===
      JSON.stringify({ env: "prod", shared: "x" }),
    t1[0]?.metadata,
  );
  check(
    "trace tags parsed",
    JSON.stringify(t1[0]?.tags?.slice().sort()) === JSON.stringify(["a", "b"]),
    t1[0]?.tags,
  );
  check(
    "trace input/output rendered",
    t1[0]?.input === "hello" && t1[0]?.output === "world",
    { i: t1[0]?.input, o: t1[0]?.output },
  );

  const sharedA = await greptimeTraceReads.getTracesByIds([SHARED_TRACE], A);
  const sharedB = await greptimeTraceReads.getTracesByIds([SHARED_TRACE], B);
  check(
    "cross-project isolation: A sees only A's row",
    sharedA.length === 1 &&
      (sharedA[0]?.metadata as Record<string, unknown>)?.tenant === "A",
    sharedA[0]?.metadata,
  );
  check(
    "cross-project isolation: B sees only B's row",
    sharedB.length === 1 &&
      (sharedB[0]?.metadata as Record<string, unknown>)?.tenant === "B",
    sharedB[0]?.metadata,
  );

  const deleted = await greptimeTraceReads.getTracesByIds([T2_DELETED], A);
  check(
    "deleted trace excluded (is_deleted filter)",
    deleted.length === 0,
    deleted.length,
  );

  const byId = await greptimeTraceReads.getTraceByIdFromTracesTable({
    traceId: T1,
    projectId: A,
  });
  check("getTraceByIdFromTracesTable returns one", byId?.id === T1, byId?.id);

  const users = await greptimeTraceReads.getTracesGroupedByUsers(A, []);
  check(
    "getTracesGroupedByUsers finds user-1",
    users.some((u) => u.user === "user-1"),
    users,
  );

  const tags = await greptimeTraceReads.getTracesGroupedByTags({
    projectId: A,
    filter: [],
  });
  const tagVals = tags.map((t) => t.value).sort();
  check(
    "getTracesGroupedByTags finds a,b",
    tagVals.includes("a") && tagVals.includes("b"),
    tagVals,
  );

  // -------------------------------------------------------------------------
  // observations
  // -------------------------------------------------------------------------
  const obs = await greptimeObservationReads.getObservationsForTrace({
    traceId: T1,
    projectId: A,
    includeIO: true,
  });
  check(
    "getObservationsForTrace returns the obs",
    obs.length === 1 && obs[0]?.id === O1,
    obs.map((o) => o.id),
  );
  check(
    "observation model + usage reduced",
    obs[0]?.model === "gpt-x" &&
      obs[0]?.totalUsage === 30 &&
      obs[0]?.usageDetails?.custom_key === 7,
    {
      model: obs[0]?.model,
      total: obs[0]?.totalUsage,
      custom: obs[0]?.usageDetails,
    },
  );
  check("observation latency computed", obs[0]?.latency === 3, obs[0]?.latency);

  const obsById = await greptimeObservationReads.getObservationsById(
    [O1],
    A,
    true,
  );
  check(
    "getObservationsById returns the obs",
    obsById.length === 1 && obsById[0]?.traceId === T1,
    obsById[0]?.traceId,
  );

  const models = await greptimeObservationReads.getObservationsGroupedByModel(
    A,
    [],
  );
  check(
    "getObservationsGroupedByModel finds gpt-x",
    models.some((m) => m.model === "gpt-x"),
    models,
  );

  check(
    "hasAnyObservation true for A",
    await greptimeObservationReads.hasAnyObservation(A),
  );

  // -------------------------------------------------------------------------
  // scores
  // -------------------------------------------------------------------------
  const scores = await greptimeScoreReads.getScoresForTraces({
    projectId: A,
    traceIds: [T1],
  });
  const numeric = scores.find((s) => s.name === "accuracy");
  const categorical = scores.find((s) => s.name === "sentiment");
  check(
    "getScoresForTraces returns both scores",
    scores.length === 2,
    scores.map((s) => s.name),
  );
  check(
    "numeric score value + null stringValue",
    numeric?.value === 0.9 &&
      numeric?.dataType === "NUMERIC" &&
      numeric?.stringValue === null,
    numeric,
  );
  check(
    "categorical score stringValue",
    categorical?.dataType === "CATEGORICAL" &&
      categorical?.stringValue === "good",
    categorical,
  );

  const scoreNames = await greptimeScoreReads.getScoreNames(A, []);
  check(
    "getScoreNames finds accuracy",
    scoreNames.some((n) => n.name === "accuracy"),
    scoreNames,
  );

  const uiRows = await greptimeScoreReads.getScoresUiTable({
    projectId: A,
    filter: [],
    orderBy: { column: "timestamp", order: "DESC" },
  });
  check(
    "getScoresUiTable returns rows with trace join",
    uiRows.length === 2 && uiRows.every((r) => r.traceName === "alpha"),
    uiRows.map((r) => ({ n: r.name, tn: r.traceName })),
  );

  const uiCount = await greptimeScoreReads.getScoresUiCount({
    projectId: A,
    filter: [],
    orderBy: null,
  });
  check("getScoresUiCount counts 2", uiCount === 2, uiCount);

  check("hasAnyScore true for A", await greptimeScoreReads.hasAnyScore(A));

  // -------------------------------------------------------------------------
  // invariant probe: no (project_id,id) with >1 distinct timestamp
  // -------------------------------------------------------------------------
  for (const table of ["traces", "observations", "scores"]) {
    const dupes = await greptimeQuery<{ project_id: string; id: string }>({
      query: `SELECT project_id, id FROM \`${table}\` WHERE project_id IN (?, ?) GROUP BY project_id, id HAVING count(distinct ${table === "observations" ? "start_time" : "timestamp"}) > 1`,
      params: [A, B],
    });
    check(
      `invariant: ${table} has no (project_id,id) timestamp duplicates`,
      dupes.length === 0,
      dupes,
    );
  }

  // -------------------------------------------------------------------------
  // cleanup (projection + EAV; raw_events is append-only and left intact)
  // -------------------------------------------------------------------------
  for (const table of [
    "traces",
    "observations",
    "scores",
    "traces_metadata",
    "observations_metadata",
    "scores_metadata",
    "traces_tags",
  ]) {
    await greptimeQuery({
      query: `DELETE FROM \`${table}\` WHERE \`project_id\` IN (?, ?)`,
      params: [A, B],
    });
  }

  await writer.shutdown();
  await closeGreptimeConnections();
  await redis.quit().catch(() => {});

  console.log(
    `\n${failures === 0 ? "CORE READS SMOKE PASSED" : `${failures} CHECK(S) FAILED`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("core reads smoke crashed", e);
  process.exit(1);
});
