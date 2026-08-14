import { describe, expect, it, vi } from "vitest";

import {
  createV4MigrationStateRecorder,
  decideV4MigrationTransitions,
  type V4MigrationReportedState,
} from "@/src/features/v4/server/v4MigrationProjectState";

const NOW = new Date("2026-08-14T12:00:00.000Z");
const REPORTER = "user-reporter";
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
  migrationStartedByUserId: null,
  migratedAt: null,
  ...overrides,
});

describe("decideV4MigrationTransitions", () => {
  it("records a first sighting of an already-ready project without events", () => {
    const decision = decideV4MigrationTransitions(
      null,
      reported({ readiness: "ready", sdkStatus: "latest", hasV4Traffic: true }),
      NOW,
      REPORTER,
    );

    expect(decision.events).toEqual([]);
    expect(decision.row.firstActionNeededAt).toBeNull();
    expect(decision.row.migrationStartedAt).toBeNull();
    expect(decision.row.migratedAt).toBeNull();
  });

  it("stamps firstActionNeededAt on a first action-needed sighting without v4 traffic", () => {
    const decision = decideV4MigrationTransitions(
      null,
      reported(),
      NOW,
      REPORTER,
    );

    expect(decision.events).toEqual([]);
    expect(decision.row.firstActionNeededAt).toEqual(NOW);
    expect(decision.row.migrationStartedAt).toBeNull();
  });

  it("emits started when a first action-needed sighting already has v4 traffic", () => {
    const decision = decideV4MigrationTransitions(
      null,
      reported({ hasV4Traffic: true }),
      NOW,
      REPORTER,
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
      REPORTER,
    );

    expect(decision.events).toEqual(["v4_migration:project_migration_started"]);
    expect(decision.row.migrationStartedAt).toEqual(NOW);
    expect(decision.row.migrationStartedByUserId).toBe(REPORTER);
    expect(decision.row.firstActionNeededAt).toEqual(EARLIER);
  });

  it("emits migrated (and started if missing) when action-needed flips to ready", () => {
    const decision = decideV4MigrationTransitions(
      stored(),
      reported({ readiness: "ready", sdkStatus: "latest", hasV4Traffic: true }),
      NOW,
      REPORTER,
    );

    expect(decision.events).toEqual([
      "v4_migration:project_migration_started",
      "v4_migration:project_migrated",
    ]);
    expect(decision.row.migrationStartedAt).toEqual(NOW);
    expect(decision.row.migratedAt).toEqual(NOW);
  });

  it("emits only migrated when started was already recorded, preserving attribution", () => {
    const decision = decideV4MigrationTransitions(
      stored({
        migrationStartedAt: EARLIER,
        migrationStartedByUserId: "user-original",
        hasV4Traffic: true,
      }),
      reported({ readiness: "ready", sdkStatus: "latest", hasV4Traffic: true }),
      NOW,
      REPORTER,
    );

    expect(decision.events).toEqual(["v4_migration:project_migrated"]);
    expect(decision.row.migrationStartedAt).toEqual(EARLIER);
    expect(decision.row.migrationStartedByUserId).toBe("user-original");
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
      REPORTER,
    );
    expect(regression.events).toEqual([]);
    expect(regression.row.readiness).toBe("action-needed");
    expect(regression.row.migratedAt).toEqual(EARLIER);

    const recovery = decideV4MigrationTransitions(
      { ...migrated, readiness: "action-needed" },
      reported({ readiness: "ready", sdkStatus: "latest", hasV4Traffic: true }),
      NOW,
      REPORTER,
    );
    expect(recovery.events).toEqual([]);
    expect(recovery.row.migratedAt).toEqual(EARLIER);
  });

  it("does not count a project that merely went idle as migrated", () => {
    const decision = decideV4MigrationTransitions(
      stored(),
      reported({
        readiness: "ready",
        sdkStatus: "no_data",
        hasV4Traffic: false,
      }),
      NOW,
      REPORTER,
    );

    expect(decision.events).toEqual([]);
    expect(decision.row.migratedAt).toBeNull();
    expect(decision.row.firstActionNeededAt).toEqual(EARLIER);
  });

  it("emits migrated after an idle interlude once v4 traffic returns", () => {
    const decision = decideV4MigrationTransitions(
      stored({ readiness: "ready", sdkStatus: "no_data" }),
      reported({ readiness: "ready", sdkStatus: "latest", hasV4Traffic: true }),
      NOW,
      REPORTER,
    );

    expect(decision.events).toEqual([
      "v4_migration:project_migration_started",
      "v4_migration:project_migrated",
    ]);
    expect(decision.row.migratedAt).toEqual(NOW);
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
      REPORTER,
    );

    expect(decision.events).toEqual([]);
    expect(decision.row.migratedAt).toBeNull();
    expect(decision.row.migrationStartedAt).toBeNull();
  });
});

describe("createV4MigrationStateRecorder", () => {
  it("reconciles a lost create race instead of dropping the report", async () => {
    // Winner concurrently created a ready-first-sighting row; the loser's
    // action-needed report must still land so the baseline is not lost.
    const winnerRow = {
      readiness: "ready",
      sdkStatus: "latest",
      hasV4Traffic: true,
      firstActionNeededAt: null,
      migrationStartedAt: null,
      migrationStartedByUserId: null,
      migratedAt: null,
    };
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winnerRow);
    const create = vi.fn().mockRejectedValue(new Error("P2002 unique"));
    const update = vi.fn().mockResolvedValue(winnerRow);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      v4MigrationProjectState: { findUnique, create, update, updateMany },
    } as never;
    const capture = vi.fn();
    const record = createV4MigrationStateRecorder({
      capture,
      cloudRegion: "EU",
      now: () => NOW,
    });

    await record({
      prisma,
      userId: REPORTER,
      organizationId: "org-1",
      projectId: "project-1",
      state: reported(),
    });

    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          readiness: "action-needed",
          firstActionNeededAt: NOW,
        }),
      }),
    );
    expect(capture).not.toHaveBeenCalled();
  });
});
