/**
 * End-to-end coverage for the V4 historic backfill chain, run on
 * the single-node ClickHouse the worker test job already provisions.
 *
 * One ordered test drives M1 → M5 one at a time and asserts the per-migration
 * correctness oracle after each step — matching how operators run the chain and
 * satisfying "execute one at a time + validate after each".
 *
 * Self-skips on CI legs that never create the v4 tables (deploy-mode != "":
 * `ch:dev-tables` is gated to the default mode), so the chain's ~50s
 * missing-table validate() hang never triggers. retry is forced to 0 so a flaky
 * backfill oracle fails loudly instead of passing on the worker's CI retry:3.
 */
import { describe, it, beforeAll, expect } from "vitest";
import {
  seedV4BackfillFixture,
  FIXTURE_PARTITION,
  type SeededFixture,
  runMigrationOnce,
  MIGRATIONS,
  FAST_RUN_ARGS,
  tablesExist,
  countFinal,
  assertM1RootSpans,
  assertM2ScratchParity,
  assertM3ChildSpans,
  assertM4DriEnrichment,
  assertM5Dropped,
} from "./harness";

const REQUIRED_TABLES = [
  "events_full",
  "events_core",
  "events_core_mv",
  "traces",
  "observations",
  "dataset_run_items_rmt",
];

describe("V4 historic backfill chain (M1→M5) E2E", () => {
  let fixture: SeededFixture | null = null;
  let tablesPresent = false;

  beforeAll(async () => {
    tablesPresent = await tablesExist(REQUIRED_TABLES);
    if (!tablesPresent) return; // non-default deploy-mode: no v4 tables
    fixture = await seedV4BackfillFixture();
  }, 120_000);

  it(
    "runs each migration one at a time and validates the desired state",
    { timeout: 300_000, retry: 0 },
    async (ctx) => {
      if (!tablesPresent || !fixture) return ctx.skip();
      const fx = fixture;

      // Pre-state: the fresh test projects own no events_full rows yet. This is
      // load-bearing because ch:dev-tables TRUNCATEs+repopulates events_full at
      // setup — only project-scoped assertions are meaningful.
      expect(await countFinal("events_full", fx.projectIdA)).toBe(0);
      expect(await countFinal("events_full", fx.projectIdB)).toBe(0);

      // M1 — virtual root spans from traces (DRI traces skipped). Restricted to
      // the fixture partition so the shared traces table's other partitions are
      // not enumerated (each chunk costs a ~30s fireQuery/query_log wait).
      await runMigrationOnce("M1", {
        ...FAST_RUN_ARGS,
        partitions: [FIXTURE_PARTITION],
      });
      await assertM1RootSpans(fx);

      // M2 — rewrite observations into the pid/tid-sorted scratch table (same
      // partition restriction; the scratch table then holds only this partition,
      // which transitively bounds M3's per-part enumeration and M4's reads).
      await runMigrationOnce("M2", {
        ...FAST_RUN_ARGS,
        partitions: [FIXTURE_PARTITION],
      });
      await assertM2ScratchParity(fx);

      // M3 — child spans from the scratch table (DRI observations skipped).
      // No partition arg (M3 chunks by part); the scratch holds only the
      // fixture partition, so this enumerates a single part.
      await runMigrationOnce("M3");
      await assertM3ChildSpans(fx);

      // M4 — DRI trace owned end-to-end with experiment enrichment. Reads
      // observations from the scratch table, so other projects' DRIs find no
      // root span and are skipped.
      await runMigrationOnce("M4");
      await assertM4DriEnrichment(fx);

      // M5 — drop the scratch table; second run proves idempotency.
      await runMigrationOnce("M5", {});
      const validation = await MIGRATIONS.M5.create().validate({});
      expect(validation.valid).toBe(true);
      await MIGRATIONS.M5.create().run({});
      await assertM5Dropped(fx);
    },
  );
});
