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

/** M4 — DRI trace owned end-to-end, subtree enriched, isolation preserved. */
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
        `trace_id = '${fx.driTraceId}' AND experiment_id = '${fx.datasetRunId}'`,
      ),
    ).toBe(fx.expected.m4DriSpans);
    // Non-DRI traces are never enriched.
    expect(
      await countFinal(
        EVENTS,
        fx.projectIdA,
        `experiment_id != '' AND trace_id != '${fx.driTraceId}'`,
      ),
    ).toBe(0);
    // Cross-project isolation: project B (no DRI) has zero enrichment.
    expect(await countFinal(EVENTS, fx.projectIdB, `experiment_id != ''`)).toBe(
      0,
    );
  }, WAIT);
}

/** M5 — scratch table dropped, events_full untouched, idempotent. */
export async function assertM5Dropped(fx: SeededFixture): Promise<void> {
  const expectedTotalA =
    fx.expected.m1RootsA + fx.expected.m3ChildSpansA + fx.expected.m4DriSpans;
  await waitForExpect(async () => {
    expect(await tableExistsAllReplicas(SCRATCH)).toBe(false);
    // events_full is untouched by the drop.
    expect(await countFinal(EVENTS, fx.projectIdA)).toBe(expectedTotalA);
  }, WAIT);
}
