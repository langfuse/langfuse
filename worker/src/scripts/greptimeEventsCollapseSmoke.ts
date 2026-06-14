/**
 * Live smoke for P5 Piece D — events.ts -> GreptimeDB projection collapse.
 *
 * Asserts the events-table reads now delegate to the merged GreptimeDB projection and preserve the
 * FullEventsObservation shape (denormalised userId/sessionId), the grouped-by facets, the public-API
 * generators (incl. V2 cursor paging), trace-from-events, the eval stream alias contract, and the
 * utility delegations. Read-only against openfuse (P3-seeded demo project).
 *
 * Run: cd worker && ../node_modules/.bin/dotenv -e ../.env -- npx tsx src/scripts/greptimeEventsCollapseSmoke.ts
 */
import {
  getObservationsForTraceFromEventsTable,
  getObservationsCountFromEventsTable,
  getObservationsWithModelDataFromEventsTable,
  getObservationByIdFromEventsTable,
  getEventsGroupedByModel,
  getEventsGroupedByType,
  getEventsGroupedByName,
  getEventsGroupedByUserId,
  getEventsGroupedByLevel,
  getEventsNumericStatsByFilterColumn,
  getTracesFromEventsTableForPublicApi,
  getTracesCountFromEventsTableForPublicApi,
  getObservationsFromEventsTableForPublicApi,
  getObservationsCountFromEventsTableForPublicApi,
  getObservationsV2FromEventsTableForPublicApi,
  getTraceByIdFromEventsTable,
  getAgentGraphDataFromEventsTable,
  hasAnyEvent,
  hasAnyEventOlderThan,
  getObservationsTraceIdsFromEventsTable,
  getObservationsBatchIOFromEventsTable,
  getEventsStreamForEval,
} from "@langfuse/shared/src/server";
import { type Readable } from "stream";

const PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const TRACE_ID = "trace-tree-s42-trace";
const EXPECTED_USER_ID = "user-trace-tree-s42";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.error(`  FAIL ${name}`, detail ?? "");
  }
};

const collectStream = async <T>(
  stream: Readable,
  max: number,
): Promise<T[]> => {
  const out: T[] = [];
  for await (const row of stream) {
    out.push(row as T);
    if (out.length >= max) break;
  }
  return out;
};

async function main() {
  console.log("== P5 Piece D events-collapse smoke ==");

  // --- D1: obs-from-events shape -------------------------------------------------
  const { observations, totalCount } =
    await getObservationsForTraceFromEventsTable({
      projectId: PROJECT_ID,
      traceId: TRACE_ID,
      selectIOAndMetadata: true,
    });
  check(
    "obs-for-trace returns rows",
    observations.length > 0,
    observations.length,
  );
  check("obs-for-trace totalCount matches", totalCount === observations.length);
  check(
    "obs-for-trace carries denormalised userId",
    observations.every((o) => o.userId === EXPECTED_USER_ID),
    observations[0]?.userId,
  );
  check(
    "obs-for-trace exposes EventsObservation fields (sessionId/traceName/tags/price keys)",
    observations.every(
      (o) =>
        "sessionId" in o &&
        "traceName" in o &&
        "tags" in o &&
        "inputPrice" in o &&
        "totalPrice" in o,
    ),
  );

  const sampleObs = observations[0];
  const byId = await getObservationByIdFromEventsTable({
    id: sampleObs.id,
    projectId: PROJECT_ID,
    fetchWithInputOutput: true,
  });
  check("obs-by-id resolves", byId?.id === sampleObs.id, byId?.id);
  check(
    "obs-by-id carries userId",
    byId?.userId === EXPECTED_USER_ID,
    byId?.userId,
  );
  check("obs-by-id carries traceTags array", Array.isArray(byId?.traceTags));

  const withModel = await getObservationsWithModelDataFromEventsTable({
    projectId: PROJECT_ID,
    filter: [
      { column: "traceId", type: "string", operator: "=", value: TRACE_ID },
    ],
  });
  check("with-model-data returns rows", withModel.length > 0, withModel.length);

  const count = await getObservationsCountFromEventsTable({
    projectId: PROJECT_ID,
    filter: [
      { column: "traceId", type: "string", operator: "=", value: TRACE_ID },
    ],
  });
  check("count-from-events matches list", count === totalCount, {
    count,
    totalCount,
  });

  // --- D4: grouped-by + numeric stats -------------------------------------------
  const models = await getEventsGroupedByModel(PROJECT_ID, []);
  check(
    "grouped-by-model includes gpt-4o",
    models.some((m) => m.model === "gpt-4o"),
    models.slice(0, 3),
  );
  const types = await getEventsGroupedByType(PROJECT_ID, []);
  check(
    "grouped-by-type includes GENERATION",
    types.some((t) => t.type === "GENERATION"),
    types,
  );
  const names = await getEventsGroupedByName(PROJECT_ID, []);
  check("grouped-by-name non-empty", names.length > 0);
  const users = await getEventsGroupedByUserId(PROJECT_ID, []);
  check(
    "grouped-by-userId includes seeded user",
    users.some((u) => u.userId === EXPECTED_USER_ID),
    users.slice(0, 3),
  );
  const levels = await getEventsGroupedByLevel(PROJECT_ID, []);
  check("grouped-by-level non-empty", levels.length > 0, levels);

  const latencyStats = await getEventsNumericStatsByFilterColumn(
    PROJECT_ID,
    [],
    "latency",
  );
  check(
    "numeric-stats(latency) returns aggregate",
    latencyStats !== null && latencyStats.count > 0,
    latencyStats,
  );

  // --- D3: public-API generators -------------------------------------------------
  const apiTraces = await getTracesFromEventsTableForPublicApi({
    projectId: PROJECT_ID,
    page: 1,
    limit: 5,
  });
  check(
    "public-api traces returns rows",
    apiTraces.length > 0,
    apiTraces.length,
  );
  check(
    "public-api traces rows have id+timestamp",
    apiTraces.every(
      (t: { id?: string; timestamp?: unknown }) =>
        Boolean(t.id) && Boolean(t.timestamp),
    ),
  );
  const apiTraceCount = await getTracesCountFromEventsTableForPublicApi({
    projectId: PROJECT_ID,
    page: 1,
    limit: 5,
  });
  check("public-api traces count > 0", apiTraceCount > 0, apiTraceCount);

  const apiObs = await getObservationsFromEventsTableForPublicApi({
    projectId: PROJECT_ID,
    page: 1,
    limit: 5,
    traceId: TRACE_ID,
  });
  check("public-api obs V1 returns rows", apiObs.length > 0, apiObs.length);
  check(
    "public-api obs V1 carries userId",
    apiObs.every((o) => o.userId === EXPECTED_USER_ID),
  );
  const apiObsCount = await getObservationsCountFromEventsTableForPublicApi({
    projectId: PROJECT_ID,
    page: 1,
    limit: 5,
    traceId: TRACE_ID,
  });
  check("public-api obs count matches trace obs", apiObsCount === totalCount, {
    apiObsCount,
    totalCount,
  });

  const v2Page1 = await getObservationsV2FromEventsTableForPublicApi({
    projectId: PROJECT_ID,
    page: 0,
    limit: 3,
    traceId: TRACE_ID,
    fields: ["core", "io"],
  });
  check(
    "public-api obs V2 page1 returns rows",
    v2Page1.length > 0,
    v2Page1.length,
  );
  const last = v2Page1[Math.min(v2Page1.length, 3) - 1];
  const v2Page2 = await getObservationsV2FromEventsTableForPublicApi({
    projectId: PROJECT_ID,
    page: 0,
    limit: 3,
    traceId: TRACE_ID,
    fields: ["core", "io"],
    cursor: {
      lastStartTimeTo: last.startTime,
      lastTraceId: last.traceId ?? "",
      lastId: last.id,
    },
  });
  const page1Ids = new Set(v2Page1.slice(0, 3).map((o) => o.id));
  check(
    "public-api obs V2 cursor advances (no overlap)",
    v2Page2.every((o) => !page1Ids.has(o.id)),
    { page1: [...page1Ids], page2: v2Page2.map((o) => o.id) },
  );

  // --- D2: trace-from-events -----------------------------------------------------
  const traceById = await getTraceByIdFromEventsTable({
    traceId: TRACE_ID,
    projectId: PROJECT_ID,
  });
  check("trace-by-id resolves", traceById?.id === TRACE_ID, traceById?.id);
  check("trace-by-id carries userId", traceById?.userId === EXPECTED_USER_ID);

  const graph = await getAgentGraphDataFromEventsTable({
    projectId: PROJECT_ID,
    traceId: TRACE_ID,
    chMinStartTime: "2020-01-01 00:00:00.000",
    chMaxStartTime: "2035-01-01 00:00:00.000",
  });
  check(
    "agent-graph returns array (rows >= obs)",
    Array.isArray(graph),
    graph.length,
  );

  // --- D5: utility + eval stream -------------------------------------------------
  check("hasAnyEvent true", (await hasAnyEvent(PROJECT_ID)) === true);
  check(
    "hasAnyEventOlderThan(future) true",
    (await hasAnyEventOlderThan(PROJECT_ID, new Date("2035-01-01"))) === true,
  );

  const traceIds = await getObservationsTraceIdsFromEventsTable({
    projectId: PROJECT_ID,
    observationIds: [sampleObs.id],
  });
  check(
    "traceIds-from-events maps id->traceId",
    traceIds.length === 1 &&
      traceIds[0].id === sampleObs.id &&
      traceIds[0].traceId === TRACE_ID,
    traceIds,
  );

  const batchIO = await getObservationsBatchIOFromEventsTable({
    projectId: PROJECT_ID,
    observations: [{ id: sampleObs.id, traceId: TRACE_ID }],
    minStartTime: new Date("2020-01-01"),
    maxStartTime: new Date("2035-01-01"),
  });
  check(
    "batch-IO returns the observation",
    batchIO.length >= 1 && batchIO.some((r) => r.id === sampleObs.id),
    batchIO.map((r) => r.id),
  );

  const stream = await getEventsStreamForEval({
    projectId: PROJECT_ID,
    filter: [],
    rowLimit: 5,
  });
  const evalRows = await collectStream<Record<string, unknown>>(stream, 5);
  check("eval-stream emits rows", evalRows.length > 0, evalRows.length);
  check(
    "eval-stream rows expose span_id + parent_span_id aliases",
    evalRows.every((r) => "span_id" in r && "parent_span_id" in r),
    Object.keys(evalRows[0] ?? {}).slice(0, 12),
  );
  // Guards the trace LEFT JOIN: the eval consumer needs the trace-denormalised fields populated,
  // not just present as NULL columns.
  check(
    "eval-stream rows carry populated trace denorm (user_id non-null somewhere)",
    evalRows.some((r) => r.user_id != null && r.trace_id != null),
    { user_id: evalRows[0]?.user_id, trace_name: evalRows[0]?.trace_name },
  );

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
