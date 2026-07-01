/**
 * Per-migration correctness oracles for the V4 historic backfill chain.
 *
 * Every assertion is project-scoped and FINAL-read (events_full / scratch are
 * ReplacingMergeTree), wrapped in waitForExpect to tolerate async insert
 * visibility. Count-predicate checks are used over row-field reads so they are
 * robust to ClickHouse JSON type coercion. The oracles are topology-agnostic;
 * the manual Cloud/replicated runner calls the identical functions.
 *
 * Oracles assume they run immediately after their migration, before
 * any later step mutates events_full (the chain skips/owns disjoint sets, so
 * e.g. the DRI trace only appears after M4).
 */
import { expect } from "vitest";
import waitForExpect from "wait-for-expect";
import {
  countFinal,
  ensureConverged,
  getOrderByClause,
  getEngine,
  tableExistsAllReplicas,
} from "./topologyShims";
import type { SeededFixture } from "./seedFixtures";

const EVENTS = "events_full";
const OBS = "observations";
const SCRATCH = "observations_pid_tid_sorting";
const WAIT = 15_000;

/** M1 — one virtual root span per non-DRI trace, DRI traces skipped. */
export async function assertM1RootSpans(fx: SeededFixture): Promise<void> {
  await ensureConverged(EVENTS);
  await waitForExpect(async () => {
    // Exactly the non-DRI traces get a `t-` root, parentless SPAN.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `span_id LIKE 't-%' AND parent_span_id = '' AND type = 'SPAN'`,
      ),
    ).toBe(fx.expected.m1RootsA);
    // Cross-project isolation: project B's shared trace id gets its own root.
    expect(await countFinal(EVENTS, fx.projectIdB, `span_id LIKE 't-%'`)).toBe(
      fx.expected.m1RootsB,
    );
    // DRI-referenced trace is skipped by M1 (M4 owns it).
    expect(
      await countFinal(EVENTS, fx.projectIdA, `span_id = 't-${fx.driTraceId}'`),
    ).toBe(0);
    // Source branch + light propagation on the plain trace root.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `span_id = 't-${fx.sharedTraceId}' AND source = 'ingestion-api-backfill' AND trace_name = 'plain-trace'`,
      ),
    ).toBe(1);
    // resourceAttributes ⇒ otel-backfill source on the otel trace root.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `span_id = 't-${fx.otelTraceId}' AND source = 'otel-backfill'`,
      ),
    ).toBe(1);
  }, WAIT);
}

/** M2 — scratch table created, re-sorted, populated 1:1 from observations. */
export async function assertM2ScratchParity(fx: SeededFixture): Promise<void> {
  await waitForExpect(async () => {
    const engine = await getEngine(SCRATCH);
    expect(engine).not.toBe("");
    // Engine matches the topology (prefix check — Cloud rewrites to Shared*).
    expect(
      ["ReplacingMergeTree", "ReplicatedReplacingMergeTree", "Shared"].some(
        (p) => engine.startsWith(p),
      ),
    ).toBe(true);

    const orderBy = (await getOrderByClause(SCRATCH)).replace(/\s/g, "");
    expect(orderBy).toBe("project_id,trace_id,id");

    await ensureConverged(SCRATCH);
    // Row parity with the source observations for project A (all obs copied,
    // DRI or not).
    const scratchCount = await countFinal(SCRATCH, fx.projectIdA);
    const obsCount = await countFinal(OBS, fx.projectIdA);
    expect(scratchCount).toBe(obsCount);
    expect(scratchCount).toBeGreaterThan(0);
  }, WAIT);
}

/** M3 — one child span per non-DRI observation, DRI observations skipped. */
export async function assertM3ChildSpans(fx: SeededFixture): Promise<void> {
  await ensureConverged(EVENTS);
  await waitForExpect(async () => {
    expect(
      await countFinal(EVENTS, fx.projectIdA, `span_id NOT LIKE 't-%'`),
    ).toBe(fx.expected.m3ChildSpansA);
    expect(
      await countFinal(EVENTS, fx.projectIdB, `span_id NOT LIKE 't-%'`),
    ).toBe(fx.expected.m3ChildSpansB);
    // DRI-referenced trace's observations are skipped by M3 (M4 owns them).
    expect(
      await countFinal(EVENTS, fx.projectIdA, `span_id = '${fx.ids.oDriRoot}'`),
    ).toBe(0);
    // Parent linkage: parentless observation → virtual trace root.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `span_id = '${fx.ids.oPlainRoot}' AND parent_span_id = 't-${fx.sharedTraceId}'`,
      ),
    ).toBe(1);
    // Child observation → its parent observation.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `span_id = '${fx.ids.oPlainChild}' AND parent_span_id = '${fx.ids.oPlainRoot}'`,
      ),
    ).toBe(1);
    // bookmarked only on the parentless span of a bookmarked trace.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `span_id = '${fx.ids.oPlainRoot}' AND bookmarked = 1`,
      ),
    ).toBe(1);
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `span_id = '${fx.ids.oPlainChild}' AND bookmarked = 0`,
      ),
    ).toBe(1);
  }, WAIT);
}

/** M4 (scenario 1) — trace-level DRI: the whole trace is enriched. */
export async function assertM4DriEnrichment(fx: SeededFixture): Promise<void> {
  await ensureConverged(EVENTS);
  await waitForExpect(async () => {
    // Every span of the DRI trace is present (virtual root + both observations).
    expect(
      await countFinal(EVENTS, fx.projectIdA, `trace_id = '${fx.driTraceId}'`),
    ).toBe(fx.expected.m4DriSpans);
    // The virtual root now exists (created by M4's leftover pass).
    expect(
      await countFinal(EVENTS, fx.projectIdA, `span_id = 't-${fx.driTraceId}'`),
    ).toBe(1);
    // All DRI-trace spans carry the experiment id (= dataset_run_id).
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `trace_id = '${fx.driTraceId}' AND experiment_id = '${fx.runs.driRunId}'`,
      ),
    ).toBe(fx.expected.m4DriSpans);
    // The genuinely non-DRI traces are never enriched (other DRI traces ARE,
    // so this is scoped to the known non-DRI trace ids rather than "everything
    // except T_dri").
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `(trace_id = '${fx.sharedTraceId}' OR trace_id = '${fx.otelTraceId}') AND experiment_id != ''`,
      ),
    ).toBe(0);
  }, WAIT);
}

/**
 * M4 (scenario 2) — observation-level DRI on a CHILD observation. Only the
 * child subtree is enriched; the virtual trace root and the parent observation
 * are materialized by M4's leftover pass WITHOUT experiment fields.
 */
export async function assertM4ObsLevelDri(fx: SeededFixture): Promise<void> {
  await ensureConverged(EVENTS);
  const t = fx.obsLevelTraceId;
  await waitForExpect(async () => {
    // M4 owns the trace end-to-end: virtual root + both observations present.
    expect(await countFinal(EVENTS, fx.projectIdA, `trace_id = '${t}'`)).toBe(
      fx.expected.m4ObsLevelSpansA,
    );
    // Exactly one span — the targeted child — is enriched.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `trace_id = '${t}' AND experiment_id != ''`,
      ),
    ).toBe(fx.expected.m4ObsLevelEnrichedA);
    // The child carries this DRI's run + item.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `span_id = '${fx.ids.oObsChild}' AND experiment_id = '${fx.runs.obsLevelRunId}' AND experiment_item_id = '${fx.runs.obsLevelItemId}'`,
      ),
    ).toBe(1);
    // The parent observation is a PLAIN leftover (no experiment fields).
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `span_id = '${fx.ids.oObsRoot}' AND experiment_id = '' AND experiment_item_id = ''`,
      ),
    ).toBe(1);
    // The virtual trace root is a PLAIN leftover too.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `span_id = 't-${t}' AND experiment_id = ''`,
      ),
    ).toBe(1);
  }, WAIT);
}

/**
 * M4 (scenario 3) — two observation-level DRIs on disjoint subtrees of ONE
 * trace, each with its own dataset_item_id. Every span in a subtree (including
 * grandchildren) carries its OWN experiment_item_id; the virtual root is plain.
 */
export async function assertM4MultiDriSameTrace(
  fx: SeededFixture,
): Promise<void> {
  await ensureConverged(EVENTS);
  const t = fx.multiDriTraceId;
  await waitForExpect(async () => {
    // Subtree A (root + 2 children + grandchild) all carry item A.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `trace_id = '${t}' AND experiment_item_id = '${fx.runs.multiItemIdA}'`,
      ),
    ).toBe(fx.expected.m4MultiSubASpans);
    // Subtree B (root + 2 children) all carry item B.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `trace_id = '${t}' AND experiment_item_id = '${fx.runs.multiItemIdB}'`,
      ),
    ).toBe(fx.expected.m4MultiSubBSpans);
    // Recursion: the grandchild of subtree A inherits subtree A's attribution.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `span_id = '${fx.ids.oSubAGrandchild}' AND experiment_item_id = '${fx.runs.multiItemIdA}'`,
      ),
    ).toBe(1);
    // No cross-attribution: subtree B's spans never carry item A.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `experiment_item_id = '${fx.runs.multiItemIdA}' AND span_id IN ('${fx.ids.oSubBRoot}', '${fx.ids.oSubBChild1}', '${fx.ids.oSubBChild2}')`,
      ),
    ).toBe(0);
    // The virtual trace root is a plain leftover (belongs to neither subtree).
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `span_id = 't-${t}' AND experiment_id = ''`,
      ),
    ).toBe(1);
    // Whole trace materialized (both subtrees + plain virtual root).
    expect(await countFinal(EVENTS, fx.projectIdA, `trace_id = '${t}'`)).toBe(
      fx.expected.m4MultiTotalA,
    );
  }, WAIT);
}

/**
 * M4 (isolation) — the same trace id is DRI'd in two projects. M4's
 * (project_id, trace_id)-scoped skip/ownership must keep each project's
 * enrichment fully separate: neither project's spans may carry the other's
 * experiment id / item id.
 */
export async function assertM4ProjectIsolation(
  fx: SeededFixture,
): Promise<void> {
  await ensureConverged(EVENTS);
  const t = fx.crossProjectTraceId;
  await waitForExpect(async () => {
    // Project A's copy is fully enriched with A's item (trace-level DRI).
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `trace_id = '${t}' AND experiment_item_id = '${fx.runs.crossItemIdA}'`,
      ),
    ).toBe(fx.expected.m4CrossProjSpansA);
    // Project B's copy is fully enriched with B's item.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdB,
        `trace_id = '${t}' AND experiment_item_id = '${fx.runs.crossItemIdB}'`,
      ),
    ).toBe(fx.expected.m4CrossProjSpansB);
    // A never sees B's experiment id/item, and vice versa.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `experiment_id = '${fx.runs.crossRunIdB}' OR experiment_item_id = '${fx.runs.crossItemIdB}'`,
      ),
    ).toBe(0);
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdB,
        `experiment_id = '${fx.runs.crossRunIdA}' OR experiment_item_id = '${fx.runs.crossItemIdA}'`,
      ),
    ).toBe(0);
    // Project B's ONLY enriched trace is the cross-project one (its shared
    // non-DRI trace stays plain).
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdB,
        `experiment_id != '' AND trace_id != '${t}'`,
      ),
    ).toBe(0);
  }, WAIT);
}

/** M5 — scratch table dropped, events_full untouched, idempotent. */
export async function assertM5Dropped(fx: SeededFixture): Promise<void> {
  const e = fx.expected;
  // Full per-project span totals across the whole chain (M1 roots + M3 child
  // spans + every M4-owned DRI trace).
  const expectedTotalA =
    e.m1RootsA +
    e.m3ChildSpansA +
    e.m4DriSpans +
    e.m4ObsLevelSpansA +
    e.m4MultiTotalA +
    e.m4CrossProjSpansA;
  const expectedTotalB = e.m1RootsB + e.m3ChildSpansB + e.m4CrossProjSpansB;
  await waitForExpect(async () => {
    expect(await tableExistsAllReplicas(SCRATCH)).toBe(false);
    // events_full is untouched by the drop.
    expect(await countFinal(EVENTS, fx.projectIdA)).toBe(expectedTotalA);
    expect(await countFinal(EVENTS, fx.projectIdB)).toBe(expectedTotalB);
  }, WAIT);
}
