/**
 * Deterministic, project-scoped fixture for the V4 historic backfill chain.
 *
 * Built from the low-level test-utils factories (not the seeder CLI) so the
 * exact source shape — v3 traces/observations WITHOUT the events_full rows the
 * migrations are supposed to create — is fully controlled.
 *
 * Shape (one fresh project A + a second project B that shares a trace id):
 *   A: T_plain  (non-DRI, bookmarked, ingestion-api source) root+child obs
 *      T_otel   (non-DRI, resourceAttributes ⇒ otel source) root obs
 *      T_dri    (trace-level DRI ⇒ owned by M4)             root+child obs
 *   B: T_shared (same trace id as T_plain, isolation check) root obs
 */
import {
  createTrace,
  createObservation,
  createDatasetRunItem,
  createTracesCh,
  createObservationsCh,
  createDatasetRunItemsCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

// Anchor the fixture in a unique, far-future yyyymm partition that no other
// seed/test writes to. This is load-bearing in CI: the shared traces /
// observations tables hold lots of other data across many months, and M1/M2
// enumerate EVERY partition. Restricting them to this partition (via the
// `partitions` run arg) bounds the chain to one chunk per step — without it the
// per-chunk fireQuery/query_log wait (~30s) over dozens of partitions blows the
// test timeout. Keep BASE_TIME and FIXTURE_PARTITION in sync.
const BASE_TIME = Date.UTC(2099, 0, 15, 12, 0, 0);
export const FIXTURE_PARTITION = "209901";

export interface SeededFixture {
  projectIdA: string;
  projectIdB: string;
  sharedTraceId: string;
  otelTraceId: string;
  driTraceId: string;
  datasetRunId: string;
  datasetId: string;
  ids: {
    oPlainRoot: string;
    oPlainChild: string;
    oOtelRoot: string;
    oDriRoot: string;
    oDriChild: string;
    oBRoot: string;
  };
  expected: {
    /** non-DRI trace roots M1 must create, per project */
    m1RootsA: number;
    m1RootsB: number;
    /** non-DRI observation spans M3 must create, per project */
    m3ChildSpansA: number;
    m3ChildSpansB: number;
    /** spans M4 owns for the DRI trace (virtual root + every observation) */
    m4DriSpans: number;
  };
}

export async function seedV4BackfillFixture(): Promise<SeededFixture> {
  const { projectId: projectIdA } = await createOrgProjectAndApiKey();
  const { projectId: projectIdB } = await createOrgProjectAndApiKey();

  const sharedTraceId = `tr-shared-${projectIdA}`;
  const otelTraceId = `tr-otel-${projectIdA}`;
  const driTraceId = `tr-dri-${projectIdA}`;

  const ids = {
    oPlainRoot: `ob-plain-root-${projectIdA}`,
    oPlainChild: `ob-plain-child-${projectIdA}`,
    oOtelRoot: `ob-otel-root-${projectIdA}`,
    oDriRoot: `ob-dri-root-${projectIdA}`,
    oDriChild: `ob-dri-child-${projectIdA}`,
    oBRoot: `ob-b-root-${projectIdB}`,
  };

  const datasetRunId = `dr-${projectIdA}`;
  const datasetId = `ds-${projectIdA}`;
  const datasetItemId = `di-${projectIdA}`;

  const otelMetadata = { resourceAttributes: '{"service.name":"checkout"}' };

  const traces = [
    // A: plain, non-DRI, bookmarked, ingestion-api source
    createTrace({
      id: sharedTraceId,
      project_id: projectIdA,
      timestamp: BASE_TIME,
      name: "plain-trace",
      bookmarked: true,
      user_id: "user-A",
      session_id: "session-A",
      metadata: { source: "API" },
      tags: ["a", "b"],
    }),
    // A: otel (resourceAttributes ⇒ otel-backfill source), non-DRI
    createTrace({
      id: otelTraceId,
      project_id: projectIdA,
      timestamp: BASE_TIME,
      name: "otel-trace",
      bookmarked: false,
      metadata: otelMetadata,
    }),
    // A: DRI-referenced (M4 owns it end-to-end)
    createTrace({
      id: driTraceId,
      project_id: projectIdA,
      timestamp: BASE_TIME,
      name: "dri-trace",
      bookmarked: false,
      user_id: "user-dri",
      session_id: "session-dri",
      metadata: { source: "API" },
    }),
    // B: shares trace id with A's plain trace — isolation check
    createTrace({
      id: sharedTraceId,
      project_id: projectIdB,
      timestamp: BASE_TIME,
      name: "b-shared-trace",
      bookmarked: false,
      metadata: { source: "API" },
    }),
  ];

  const observations = [
    // A / plain
    createObservation({
      id: ids.oPlainRoot,
      trace_id: sharedTraceId,
      project_id: projectIdA,
      parent_observation_id: null,
      type: "SPAN",
      start_time: BASE_TIME,
      name: "plain-root",
      metadata: { source: "API" },
    }),
    createObservation({
      id: ids.oPlainChild,
      trace_id: sharedTraceId,
      project_id: projectIdA,
      parent_observation_id: ids.oPlainRoot,
      type: "GENERATION",
      start_time: BASE_TIME,
      name: "plain-child",
      metadata: { source: "API" },
    }),
    // A / otel root (resourceAttributes ⇒ otel source on the child span too)
    createObservation({
      id: ids.oOtelRoot,
      trace_id: otelTraceId,
      project_id: projectIdA,
      parent_observation_id: null,
      type: "SPAN",
      start_time: BASE_TIME,
      name: "otel-root",
      metadata: otelMetadata,
    }),
    // A / dri tree (owned by M4)
    createObservation({
      id: ids.oDriRoot,
      trace_id: driTraceId,
      project_id: projectIdA,
      parent_observation_id: null,
      type: "SPAN",
      start_time: BASE_TIME,
      name: "dri-root",
      metadata: { source: "API" },
    }),
    createObservation({
      id: ids.oDriChild,
      trace_id: driTraceId,
      project_id: projectIdA,
      parent_observation_id: ids.oDriRoot,
      type: "GENERATION",
      start_time: BASE_TIME,
      name: "dri-child",
      metadata: { source: "API" },
    }),
    // B / shared trace root
    createObservation({
      id: ids.oBRoot,
      trace_id: sharedTraceId,
      project_id: projectIdB,
      parent_observation_id: null,
      type: "SPAN",
      start_time: BASE_TIME,
      name: "b-root",
      metadata: { source: "API" },
    }),
  ];

  const datasetRunItems = [
    createDatasetRunItem({
      id: `dri-row-${projectIdA}`,
      project_id: projectIdA,
      trace_id: driTraceId,
      observation_id: null, // trace-level ⇒ root span is the virtual trace root
      dataset_run_id: datasetRunId,
      dataset_run_name: "exp-run",
      dataset_id: datasetId,
      dataset_item_id: datasetItemId,
      created_at: BASE_TIME,
      dataset_run_created_at: BASE_TIME,
    }),
  ];

  await createTracesCh(traces);
  await createObservationsCh(observations);
  await createDatasetRunItemsCh(datasetRunItems);

  return {
    projectIdA,
    projectIdB,
    sharedTraceId,
    otelTraceId,
    driTraceId,
    datasetRunId,
    datasetId,
    ids,
    expected: {
      m1RootsA: 2, // T_plain, T_otel
      m1RootsB: 1, // T_shared
      m3ChildSpansA: 3, // plain root+child, otel root
      m3ChildSpansB: 1, // b root
      m4DriSpans: 3, // t-dri root + dri root + dri child
    },
  };
}
