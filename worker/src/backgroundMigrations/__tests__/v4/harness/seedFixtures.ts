/**
 * Deterministic, project-scoped fixture for the V4 historic backfill chain.
 *
 * Built from the low-level test-utils factories (not the seeder CLI) so the
 * exact source shape — v3 traces/observations WITHOUT the events_full rows the
 * migrations are supposed to create — is fully controlled.
 *
 * Shape (one fresh project A + a second project B that shares trace ids):
 *   A: T_plain    (non-DRI, bookmarked, ingestion-api source) root+child obs
 *      T_otel     (non-DRI, resourceAttributes ⇒ otel source) root obs
 *      T_dri      (trace-level DRI ⇒ owned by M4)             root+child obs
 *      T_obsLevel (observation-level DRI on the CHILD obs)    root+child obs
 *      T_multiDri (two observation-level DRIs, one trace)     two subtrees
 *      T_crossA   (trace-level DRI, id shared with project B) root+child obs
 *   B: T_shared   (same trace id as T_plain, non-DRI)         root obs
 *      T_crossB   (trace-level DRI, SAME id as T_crossA)      root obs
 *
 * The M4 DRI cases each target a distinct behaviour:
 *   - T_dri       trace-level ⇒ the whole trace is enriched (virtual root + obs)
 *   - T_obsLevel  obs-level on a child ⇒ ONLY the child subtree is enriched;
 *                 the virtual root + parent obs fall through M4's leftover pass
 *                 and are materialized PLAIN (no experiment fields)
 *   - T_multiDri  two obs-level DRIs (distinct dataset_item_id) on disjoint
 *                 subtrees of one trace ⇒ each subtree (incl. grandchildren)
 *                 carries its OWN experiment_item_id; the virtual root is plain
 *   - T_crossA/B  same trace id in two projects, each with its own DRI ⇒ M4's
 *                 (project_id, trace_id)-scoped skip/ownership must keep the two
 *                 enrichments fully isolated
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
  /** observation-level DRI on a child span (scenario 2) */
  obsLevelTraceId: string;
  /** two observation-level DRIs on disjoint subtrees of one trace (scenario 3) */
  multiDriTraceId: string;
  /** trace id present in BOTH projects, each with its own DRI (isolation) */
  crossProjectTraceId: string;
  datasetId: string;
  datasetIdB: string;
  /** experiment_id (= dataset_run_id) / experiment_item_id (= dataset_item_id) per DRI */
  runs: {
    driRunId: string;
    driItemId: string;
    obsLevelRunId: string;
    obsLevelItemId: string;
    multiRunIdA: string;
    multiItemIdA: string;
    multiRunIdB: string;
    multiItemIdB: string;
    crossRunIdA: string;
    crossItemIdA: string;
    crossRunIdB: string;
    crossItemIdB: string;
  };
  ids: {
    oPlainRoot: string;
    oPlainChild: string;
    oOtelRoot: string;
    oDriRoot: string;
    oDriChild: string;
    oBRoot: string;
    // scenario 2 — observation-level DRI on the child
    oObsRoot: string;
    oObsChild: string;
    // scenario 3 — two subtrees under one trace, each its own obs-level DRI
    oSubARoot: string;
    oSubAChild1: string;
    oSubAChild2: string;
    oSubAGrandchild: string;
    oSubBRoot: string;
    oSubBChild1: string;
    oSubBChild2: string;
    // cross-project isolation — same trace id, two projects
    oCpRootA: string;
    oCpChildA: string;
    oCpRootB: string;
  };
  expected: {
    /** non-DRI trace roots M1 must create, per project */
    m1RootsA: number;
    m1RootsB: number;
    /** non-DRI observation spans M3 must create, per project */
    m3ChildSpansA: number;
    m3ChildSpansB: number;
    /** spans M4 owns for the trace-level DRI trace (virtual root + every observation) */
    m4DriSpans: number;
    /** scenario 2: total spans materialized for the obs-level DRI trace (1 enriched + 2 plain) */
    m4ObsLevelSpansA: number;
    /** scenario 2: only the targeted child subtree is enriched */
    m4ObsLevelEnrichedA: number;
    /** scenario 3: enriched spans per subtree (root + descendants) */
    m4MultiSubASpans: number;
    m4MultiSubBSpans: number;
    /** scenario 3: total spans for the multi-DRI trace (both subtrees + plain virtual root) */
    m4MultiTotalA: number;
    /** isolation: trace-level DRI spans per project for the shared-id trace */
    m4CrossProjSpansA: number;
    m4CrossProjSpansB: number;
  };
}

export async function seedV4BackfillFixture(): Promise<SeededFixture> {
  const { projectId: projectIdA } = await createOrgProjectAndApiKey();
  const { projectId: projectIdB } = await createOrgProjectAndApiKey();

  const sharedTraceId = `tr-shared-${projectIdA}`;
  const otelTraceId = `tr-otel-${projectIdA}`;
  const driTraceId = `tr-dri-${projectIdA}`;
  const obsLevelTraceId = `tr-obslevel-${projectIdA}`;
  const multiDriTraceId = `tr-multidri-${projectIdA}`;
  // Deliberately NOT suffixed with a project id: this same trace id is seeded
  // into both project A and project B to exercise (project_id, trace_id)-scoped
  // isolation in M4.
  const crossProjectTraceId = `tr-crossproj-${projectIdA}-${projectIdB}`;

  const ids = {
    oPlainRoot: `ob-plain-root-${projectIdA}`,
    oPlainChild: `ob-plain-child-${projectIdA}`,
    oOtelRoot: `ob-otel-root-${projectIdA}`,
    oDriRoot: `ob-dri-root-${projectIdA}`,
    oDriChild: `ob-dri-child-${projectIdA}`,
    oBRoot: `ob-b-root-${projectIdB}`,
    oObsRoot: `ob-obslevel-root-${projectIdA}`,
    oObsChild: `ob-obslevel-child-${projectIdA}`,
    oSubARoot: `ob-mdri-a-root-${projectIdA}`,
    oSubAChild1: `ob-mdri-a-child1-${projectIdA}`,
    oSubAChild2: `ob-mdri-a-child2-${projectIdA}`,
    oSubAGrandchild: `ob-mdri-a-grandchild-${projectIdA}`,
    oSubBRoot: `ob-mdri-b-root-${projectIdA}`,
    oSubBChild1: `ob-mdri-b-child1-${projectIdA}`,
    oSubBChild2: `ob-mdri-b-child2-${projectIdA}`,
    oCpRootA: `ob-crossproj-a-root-${projectIdA}`,
    oCpChildA: `ob-crossproj-a-child-${projectIdA}`,
    oCpRootB: `ob-crossproj-b-root-${projectIdB}`,
  };

  const datasetId = `ds-${projectIdA}`;
  const datasetIdB = `ds-${projectIdB}`;

  // Distinct run/item ids per DRI so experiment_id / experiment_item_id pin
  // down exactly which DRI enriched which span (required for the per-parent
  // attribution and cross-project isolation assertions).
  const runs = {
    driRunId: `dr-${projectIdA}`,
    driItemId: `di-${projectIdA}`,
    obsLevelRunId: `dr-obslevel-${projectIdA}`,
    obsLevelItemId: `di-obslevel-${projectIdA}`,
    multiRunIdA: `dr-multidri-a-${projectIdA}`,
    multiItemIdA: `di-multidri-a-${projectIdA}`,
    multiRunIdB: `dr-multidri-b-${projectIdA}`,
    multiItemIdB: `di-multidri-b-${projectIdA}`,
    crossRunIdA: `dr-crossproj-a-${projectIdA}`,
    crossItemIdA: `di-crossproj-a-${projectIdA}`,
    crossRunIdB: `dr-crossproj-b-${projectIdB}`,
    crossItemIdB: `di-crossproj-b-${projectIdB}`,
  };

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
    // A: observation-level DRI target (scenario 2) — M4 owns it end-to-end
    createTrace({
      id: obsLevelTraceId,
      project_id: projectIdA,
      timestamp: BASE_TIME,
      name: "obslevel-trace",
      bookmarked: false,
      metadata: { source: "API" },
    }),
    // A: two observation-level DRIs on one trace (scenario 3)
    createTrace({
      id: multiDriTraceId,
      project_id: projectIdA,
      timestamp: BASE_TIME,
      name: "multidri-trace",
      bookmarked: false,
      metadata: { source: "API" },
    }),
    // A: trace-level DRI whose id is ALSO seeded in project B (isolation)
    createTrace({
      id: crossProjectTraceId,
      project_id: projectIdA,
      timestamp: BASE_TIME,
      name: "crossproj-trace-a",
      bookmarked: false,
      metadata: { source: "API" },
    }),
    // B: shares trace id with A's plain trace — non-DRI isolation check
    createTrace({
      id: sharedTraceId,
      project_id: projectIdB,
      timestamp: BASE_TIME,
      name: "b-shared-trace",
      bookmarked: false,
      metadata: { source: "API" },
    }),
    // B: trace-level DRI sharing its id with A's T_crossA — DRI isolation check
    createTrace({
      id: crossProjectTraceId,
      project_id: projectIdB,
      timestamp: BASE_TIME,
      name: "crossproj-trace-b",
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
    // A / scenario 2 — obs-level DRI targets the CHILD; root stays plain
    createObservation({
      id: ids.oObsRoot,
      trace_id: obsLevelTraceId,
      project_id: projectIdA,
      parent_observation_id: null,
      type: "SPAN",
      start_time: BASE_TIME,
      name: "obslevel-root",
      metadata: { source: "API" },
    }),
    createObservation({
      id: ids.oObsChild,
      trace_id: obsLevelTraceId,
      project_id: projectIdA,
      parent_observation_id: ids.oObsRoot,
      type: "GENERATION",
      start_time: BASE_TIME,
      name: "obslevel-child",
      metadata: { source: "API" },
    }),
    // A / scenario 3 — subtree A (root → 2 children, one with a grandchild)
    createObservation({
      id: ids.oSubARoot,
      trace_id: multiDriTraceId,
      project_id: projectIdA,
      parent_observation_id: null,
      type: "SPAN",
      start_time: BASE_TIME,
      name: "mdri-a-root",
      metadata: { source: "API" },
    }),
    createObservation({
      id: ids.oSubAChild1,
      trace_id: multiDriTraceId,
      project_id: projectIdA,
      parent_observation_id: ids.oSubARoot,
      type: "SPAN",
      start_time: BASE_TIME,
      name: "mdri-a-child1",
      metadata: { source: "API" },
    }),
    createObservation({
      id: ids.oSubAChild2,
      trace_id: multiDriTraceId,
      project_id: projectIdA,
      parent_observation_id: ids.oSubARoot,
      type: "GENERATION",
      start_time: BASE_TIME,
      name: "mdri-a-child2",
      metadata: { source: "API" },
    }),
    // grandchild ⇒ confirms findAllChildren recurses past direct children
    createObservation({
      id: ids.oSubAGrandchild,
      trace_id: multiDriTraceId,
      project_id: projectIdA,
      parent_observation_id: ids.oSubAChild1,
      type: "GENERATION",
      start_time: BASE_TIME,
      name: "mdri-a-grandchild",
      metadata: { source: "API" },
    }),
    // A / scenario 3 — subtree B (root → 2 children)
    createObservation({
      id: ids.oSubBRoot,
      trace_id: multiDriTraceId,
      project_id: projectIdA,
      parent_observation_id: null,
      type: "SPAN",
      start_time: BASE_TIME,
      name: "mdri-b-root",
      metadata: { source: "API" },
    }),
    createObservation({
      id: ids.oSubBChild1,
      trace_id: multiDriTraceId,
      project_id: projectIdA,
      parent_observation_id: ids.oSubBRoot,
      type: "GENERATION",
      start_time: BASE_TIME,
      name: "mdri-b-child1",
      metadata: { source: "API" },
    }),
    createObservation({
      id: ids.oSubBChild2,
      trace_id: multiDriTraceId,
      project_id: projectIdA,
      parent_observation_id: ids.oSubBRoot,
      type: "GENERATION",
      start_time: BASE_TIME,
      name: "mdri-b-child2",
      metadata: { source: "API" },
    }),
    // A / cross-project trace (trace-level DRI) — root + child
    createObservation({
      id: ids.oCpRootA,
      trace_id: crossProjectTraceId,
      project_id: projectIdA,
      parent_observation_id: null,
      type: "SPAN",
      start_time: BASE_TIME,
      name: "crossproj-a-root",
      metadata: { source: "API" },
    }),
    createObservation({
      id: ids.oCpChildA,
      trace_id: crossProjectTraceId,
      project_id: projectIdA,
      parent_observation_id: ids.oCpRootA,
      type: "GENERATION",
      start_time: BASE_TIME,
      name: "crossproj-a-child",
      metadata: { source: "API" },
    }),
    // B / cross-project trace (SAME trace id, project B) — root only
    createObservation({
      id: ids.oCpRootB,
      trace_id: crossProjectTraceId,
      project_id: projectIdB,
      parent_observation_id: null,
      type: "SPAN",
      start_time: BASE_TIME,
      name: "crossproj-b-root",
      metadata: { source: "API" },
    }),
  ];

  const datasetRunItems = [
    // scenario 1 — trace-level DRI (root span is the virtual trace root)
    createDatasetRunItem({
      id: `dri-row-${projectIdA}`,
      project_id: projectIdA,
      trace_id: driTraceId,
      observation_id: null,
      dataset_run_id: runs.driRunId,
      dataset_run_name: "exp-run",
      dataset_id: datasetId,
      dataset_item_id: runs.driItemId,
      created_at: BASE_TIME,
      dataset_run_created_at: BASE_TIME,
    }),
    // scenario 2 — observation-level DRI pointing at the CHILD observation
    createDatasetRunItem({
      id: `dri-obslevel-${projectIdA}`,
      project_id: projectIdA,
      trace_id: obsLevelTraceId,
      observation_id: ids.oObsChild,
      dataset_run_id: runs.obsLevelRunId,
      dataset_run_name: "obslevel-run",
      dataset_id: datasetId,
      dataset_item_id: runs.obsLevelItemId,
      created_at: BASE_TIME,
      dataset_run_created_at: BASE_TIME,
    }),
    // scenario 3 — two observation-level DRIs, same trace, disjoint subtrees
    createDatasetRunItem({
      id: `dri-multidri-a-${projectIdA}`,
      project_id: projectIdA,
      trace_id: multiDriTraceId,
      observation_id: ids.oSubARoot,
      dataset_run_id: runs.multiRunIdA,
      dataset_run_name: "multidri-run-a",
      dataset_id: datasetId,
      dataset_item_id: runs.multiItemIdA,
      created_at: BASE_TIME,
      dataset_run_created_at: BASE_TIME,
    }),
    createDatasetRunItem({
      id: `dri-multidri-b-${projectIdA}`,
      project_id: projectIdA,
      trace_id: multiDriTraceId,
      observation_id: ids.oSubBRoot,
      dataset_run_id: runs.multiRunIdB,
      dataset_run_name: "multidri-run-b",
      dataset_id: datasetId,
      dataset_item_id: runs.multiItemIdB,
      created_at: BASE_TIME,
      dataset_run_created_at: BASE_TIME,
    }),
    // isolation — project A's DRI on the shared trace id
    createDatasetRunItem({
      id: `dri-crossproj-a-${projectIdA}`,
      project_id: projectIdA,
      trace_id: crossProjectTraceId,
      observation_id: null,
      dataset_run_id: runs.crossRunIdA,
      dataset_run_name: "crossproj-run-a",
      dataset_id: datasetId,
      dataset_item_id: runs.crossItemIdA,
      created_at: BASE_TIME,
      dataset_run_created_at: BASE_TIME,
    }),
    // isolation — project B's DRI on the SAME trace id
    createDatasetRunItem({
      id: `dri-crossproj-b-${projectIdB}`,
      project_id: projectIdB,
      trace_id: crossProjectTraceId,
      observation_id: null,
      dataset_run_id: runs.crossRunIdB,
      dataset_run_name: "crossproj-run-b",
      dataset_id: datasetIdB,
      dataset_item_id: runs.crossItemIdB,
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
    obsLevelTraceId,
    multiDriTraceId,
    crossProjectTraceId,
    datasetId,
    datasetIdB,
    runs,
    ids,
    expected: {
      m1RootsA: 2, // T_plain, T_otel (all DRI traces skipped by M1)
      m1RootsB: 1, // T_shared (T_crossB is DRI ⇒ skipped by M1)
      m3ChildSpansA: 3, // plain root+child, otel root (DRI obs skipped by M3)
      m3ChildSpansB: 1, // b root
      m4DriSpans: 3, // t-dri root + dri root + dri child
      m4ObsLevelSpansA: 3, // t-obslevel(plain) + root(plain) + child(enriched)
      m4ObsLevelEnrichedA: 1, // only the targeted child
      m4MultiSubASpans: 4, // subA root + 2 children + 1 grandchild
      m4MultiSubBSpans: 3, // subB root + 2 children
      m4MultiTotalA: 8, // both subtrees (7) + plain virtual root (1)
      m4CrossProjSpansA: 3, // t-crossproj + root + child (trace-level ⇒ all enriched)
      m4CrossProjSpansB: 2, // t-crossproj + root (trace-level ⇒ all enriched)
    },
  };
}
