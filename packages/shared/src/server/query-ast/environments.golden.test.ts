import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../env";
import {
  capturedQueries,
  clickhouseFormatAvailable,
  normalizeCapturedQueries,
  resetCaptures,
} from "./goldenHarness";

// Record the exec seam instead of hitting ClickHouse. The factory is hoisted
// above imports, so it pulls the harness in via dynamic import; the captured
// store is a module singleton shared with the assertions below.
vi.mock("../repositories/clickhouse", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../repositories/clickhouse")>();
  const { buildClickhouseMock } = await import("./goldenHarness.js");
  return buildClickhouseMock(actual);
});

import { getEnvironmentsForProject } from "../repositories/environments";

const FIXED_PROJECT_ID = "golden-project";
// Fixed so the captured params are deterministic across runs.
const FIXED_FROM_TIMESTAMP = new Date("2026-01-01T00:00:00.000Z");

// clickhouse format is the normalizer; without it a comparison would be
// unnormalized and could pass on cosmetic-only differences. Skip loudly.
const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

if (!clickhouseFormatAvailable()) {
  console.warn(
    "[golden-harness] `clickhouse format` unavailable — skipping golden SQL tests. Install clickhouse-local to run them.",
  );
}

describeWithClickhouse("golden: environments.getEnvironmentsForProject", () => {
  const originalWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;

  beforeEach(() => resetCaptures());
  afterAll(() => {
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE = originalWriteMode;
  });

  // Variants enumerated by the inputs that branch the emitted SQL: the write
  // mode (legacy traces+observations UNION vs. events_core) and whether a
  // fromTimestamp bound is present. `dual` and `events_only` take the same code
  // branch, so `events_only` covers both.
  const variants = [
    { writeMode: "legacy" as const, fromTimestamp: undefined },
    { writeMode: "legacy" as const, fromTimestamp: FIXED_FROM_TIMESTAMP },
    { writeMode: "events_only" as const, fromTimestamp: undefined },
    { writeMode: "events_only" as const, fromTimestamp: FIXED_FROM_TIMESTAMP },
  ];

  for (const variant of variants) {
    const name = `writeMode=${variant.writeMode} fromTimestamp=${
      variant.fromTimestamp ? "set" : "unset"
    }`;

    it(name, async () => {
      env.LANGFUSE_MIGRATION_V4_WRITE_MODE = variant.writeMode;

      await getEnvironmentsForProject({
        projectId: FIXED_PROJECT_ID,
        fromTimestamp: variant.fromTimestamp,
      });

      // One repository call emits its tracing read then its scores read; the
      // order is part of the baseline.
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });
  }
});
