/**
 * Events-only write-mode routing for getEnvironmentsForProject.
 *
 * In events_only mode tracing data is written ONLY to the events tables; the
 * legacy traces/observations tables stay empty. The environment filter options
 * must read events_core, otherwise the dropdown only shows environments that
 * appear on scores (which keep their own table in every write mode).
 *
 * The write mode is read from the parsed env at module load, so it is forced
 * via process.env BEFORE any module is imported. Split into its own file
 * because the env is process-wide; the legacy-mode tests live in
 * environment-repository.servertest.ts.
 */
import { vi } from "vitest";

// The events tables are created only by the ClickHouse dev-tables setup (CI's
// "Setup Dev Tables" step), which runs in the default deploy-mode where
// .env.dev.example enables the v4 preview opt-in. The -azure and
// -redis-cluster CI runs skip that setup, so the events tables are absent and
// the reads below would error. Capture the ORIGINAL opt-in flag BEFORE the
// override forces it on.
const eventsTableAvailable = vi.hoisted(() => {
  const enabled =
    process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true";
  process.env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
  // events_only requires the preview opt-in (web read paths gate on it, and
  // worker/web env validation enforces the pairing).
  process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";
  return enabled;
});

import {
  createEvent,
  createEventsCh,
  createTraceScore,
  createScoresCh,
  getEnvironmentsForProject,
} from "@langfuse/shared/src/server";
import { env } from "@langfuse/shared/src/env";
import { randomUUID } from "crypto";

// Skip on environments without the events dev tables (azure / redis-cluster
// CI). Mirrors the gating used across the other events-table server tests.
const maybe = eventsTableAvailable ? describe : describe.skip;

// At least one always-running test so the file does not hang on the redis
// connections opened by the shared server imports when the events-table tests
// below are skipped via `maybe`.
describe("environment repository (events_only write mode) liveness", () => {
  it("should not hang when the events table is unavailable", () => {});
});

maybe("environment repository (events_only write mode)", () => {
  // Sanity check that the forced write mode reached the parsed shared env that
  // getEnvironmentsForProject routes on. If this ever regresses, the
  // assertions below would silently read the (empty) legacy tables.
  it("forces events_only write mode", () => {
    expect(env.LANGFUSE_MIGRATION_V4_WRITE_MODE).toBe("events_only");
  });

  it("should return environments from the events table and scores", async () => {
    const projectId = randomUUID();
    const eventEnvironment = randomUUID();
    const scoreEnvironment = randomUUID();

    // events_only deployments write tracing data exclusively to the events
    // tables (events_core is populated from events_full via MV).
    await createEventsCh([
      createEvent({
        project_id: projectId,
        environment: eventEnvironment,
      }),
    ]);
    await createScoresCh([
      createTraceScore({
        project_id: projectId,
        environment: scoreEnvironment,
      }),
    ]);

    const environments = await getEnvironmentsForProject({ projectId });

    expect(environments).toEqual(
      expect.arrayContaining([
        { environment: eventEnvironment },
        { environment: scoreEnvironment },
        { environment: "default" },
      ]),
    );
    expect(environments).toHaveLength(3);
  });

  it("should respect fromTimestamp on the events table read", async () => {
    const projectId = randomUUID();
    const oldEnvironment = randomUUID();
    const recentEnvironment = randomUUID();
    const now = Date.now();

    await createEventsCh([
      createEvent({
        project_id: projectId,
        environment: oldEnvironment,
        start_time: (now - 10 * 24 * 60 * 60 * 1000) * 1000, // micros
      }),
      createEvent({
        project_id: projectId,
        environment: recentEnvironment,
        start_time: now * 1000, // micros
      }),
    ]);

    const environments = await getEnvironmentsForProject({
      projectId,
      fromTimestamp: new Date(now - 24 * 60 * 60 * 1000),
    });

    expect(environments).toEqual(
      expect.arrayContaining([
        { environment: recentEnvironment },
        { environment: "default" },
      ]),
    );
    expect(environments).toHaveLength(2);
  });
});
