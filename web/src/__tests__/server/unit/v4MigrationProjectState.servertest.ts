import { describe, expect, it } from "vitest";

import {
  decideV4MigrationTransitions,
  type V4MigrationReportedState,
} from "@/src/features/v4/server/v4MigrationProjectState";

const NOW = new Date("2026-08-14T12:00:00.000Z");
const EARLIER = new Date("2026-08-01T12:00:00.000Z");

const reported = (
  overrides?: Partial<V4MigrationReportedState>,
): V4MigrationReportedState => ({
  readiness: "action-needed",
  sdkStatus: "legacy",
  hasV4Traffic: false,
  ...overrides,
});

const stored = (
  overrides?: Partial<Parameters<typeof decideV4MigrationTransitions>[0]>,
) => ({
  readiness: "action-needed",
  sdkStatus: "legacy",
  hasV4Traffic: false,
  firstActionNeededAt: EARLIER,
  migrationStartedAt: null,
  migratedAt: null,
  ...overrides,
});

describe("decideV4MigrationTransitions", () => {
  it("records a first sighting of an already-ready project without events", () => {
    const decision = decideV4MigrationTransitions(
      null,
      reported({ readiness: "ready", sdkStatus: "latest", hasV4Traffic: true }),
      NOW,
    );

    expect(decision.events).toEqual([]);
    expect(decision.row.firstActionNeededAt).toBeNull();
    expect(decision.row.migrationStartedAt).toBeNull();
    expect(decision.row.migratedAt).toBeNull();
  });

  it("stamps firstActionNeededAt on a first action-needed sighting without v4 traffic", () => {
    const decision = decideV4MigrationTransitions(null, reported(), NOW);

    expect(decision.events).toEqual([]);
    expect(decision.row.firstActionNeededAt).toEqual(NOW);
    expect(decision.row.migrationStartedAt).toBeNull();
  });

  it("emits started when a first action-needed sighting already has v4 traffic", () => {
    const decision = decideV4MigrationTransitions(
      null,
      reported({ hasV4Traffic: true }),
      NOW,
    );

    expect(decision.events).toEqual(["v4_migration:project_migration_started"]);
    expect(decision.row.migrationStartedAt).toEqual(NOW);
    expect(decision.row.migratedAt).toBeNull();
  });

  it("emits started when v4 traffic first appears mid-migration", () => {
    const decision = decideV4MigrationTransitions(
      stored(),
      reported({ hasV4Traffic: true }),
      NOW,
    );

    expect(decision.events).toEqual(["v4_migration:project_migration_started"]);
    expect(decision.row.migrationStartedAt).toEqual(NOW);
    expect(decision.row.firstActionNeededAt).toEqual(EARLIER);
  });

  it("emits migrated (and started if missing) when action-needed flips to ready", () => {
    const decision = decideV4MigrationTransitions(
      stored(),
      reported({ readiness: "ready", sdkStatus: "latest", hasV4Traffic: true }),
      NOW,
    );

    expect(decision.events).toEqual([
      "v4_migration:project_migration_started",
      "v4_migration:project_migrated",
    ]);
    expect(decision.row.migrationStartedAt).toEqual(NOW);
    expect(decision.row.migratedAt).toEqual(NOW);
  });

  it("emits only migrated when started was already recorded", () => {
    const decision = decideV4MigrationTransitions(
      stored({ migrationStartedAt: EARLIER, hasV4Traffic: true }),
      reported({ readiness: "ready", sdkStatus: "latest", hasV4Traffic: true }),
      NOW,
    );

    expect(decision.events).toEqual(["v4_migration:project_migrated"]);
    expect(decision.row.migrationStartedAt).toEqual(EARLIER);
    expect(decision.row.migratedAt).toEqual(NOW);
  });

  it("never re-emits after a project is migrated, even across regressions", () => {
    const migrated = stored({
      readiness: "ready",
      sdkStatus: "latest",
      hasV4Traffic: true,
      migrationStartedAt: EARLIER,
      migratedAt: EARLIER,
    });

    const regression = decideV4MigrationTransitions(
      migrated,
      reported({ sdkStatus: "legacy", hasV4Traffic: true }),
      NOW,
    );
    expect(regression.events).toEqual([]);
    expect(regression.row.readiness).toBe("action-needed");
    expect(regression.row.migratedAt).toEqual(EARLIER);

    const recovery = decideV4MigrationTransitions(
      { ...migrated, readiness: "action-needed" },
      reported({ readiness: "ready", sdkStatus: "latest", hasV4Traffic: true }),
      NOW,
    );
    expect(recovery.events).toEqual([]);
    expect(recovery.row.migratedAt).toEqual(EARLIER);
  });

  it("never counts an always-ready project as a migration", () => {
    const decision = decideV4MigrationTransitions(
      stored({
        readiness: "ready",
        sdkStatus: "latest",
        hasV4Traffic: true,
        firstActionNeededAt: null,
      }),
      reported({ readiness: "ready", sdkStatus: "latest", hasV4Traffic: true }),
      NOW,
    );

    expect(decision.events).toEqual([]);
    expect(decision.row.migratedAt).toBeNull();
    expect(decision.row.migrationStartedAt).toBeNull();
  });
});
