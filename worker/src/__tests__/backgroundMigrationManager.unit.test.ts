import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  name: string;
  script: string;
  args: Record<string, unknown>;
  finishedAt: Date | null;
  failedAt: Date | null;
  lockedAt: Date | null;
  workerId: string | null;
};

// In-memory background_migrations table. The real table holds every migration
// the schema ships, so running the manager against it would execute them.
const db = vi.hoisted(() => {
  const rows: Row[] = [];
  const backgroundMigration = {
    findFirst: vi.fn(
      async () =>
        rows
          .filter((row) => !row.finishedAt && !row.failedAt)
          .sort((a, b) => a.name.localeCompare(b.name))[0] ?? null,
    ),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: object }) =>
        Object.assign(rows.find((row) => row.id === where.id)!, data),
    ),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  const prisma = {
    backgroundMigration,
    $transaction: vi.fn(
      async (fn: (tx: { backgroundMigration: object }) => Promise<void>) =>
        fn({ backgroundMigration }),
    ),
  };
  return { rows, prisma };
});

vi.mock("@langfuse/shared/src/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/db")>()),
  prisma: db.prisma,
}));

import {
  BACKGROUND_MIGRATION_RESCAN_INTERVAL_MS,
  BackgroundMigrationManager,
} from "../backgroundMigrations/backgroundMigrationManager";

const migration = {
  validate: vi.fn(),
  run: vi.fn(async () => {}),
  abort: vi.fn(async () => {}),
};

const insertRow = (name: string): Row => {
  const row: Row = {
    id: name,
    name,
    script: "testMigration",
    args: {},
    finishedAt: null,
    failedAt: null,
    lockedAt: null,
    workerId: null,
  };
  db.rows.push(row);
  return row;
};

// Resolves once the scan in progress has finished and scheduled the next one.
const waitForScans = async (count: number) => {
  await vi.waitFor(() => {
    expect(db.prisma.$transaction.mock.calls.length).toBeGreaterThanOrEqual(
      count,
    );
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });
};

describe("BackgroundMigrationManager", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    db.rows.length = 0;
    vi.clearAllMocks();
    migration.validate.mockResolvedValue({
      valid: true,
      invalidReason: undefined,
    });
    // Vitest cannot require() the TypeScript migration scripts.
    vi.spyOn(
      BackgroundMigrationManager as unknown as {
        loadMigration: () => typeof migration;
      },
      "loadMigration",
    ).mockReturnValue(migration);
  });

  afterEach(async () => {
    await BackgroundMigrationManager.close();
    vi.useRealTimers();
  });

  it("runs a migration inserted after the startup scan without a restart", async () => {
    BackgroundMigrationManager.start();
    await waitForScans(1);
    expect(migration.run).not.toHaveBeenCalled();

    const row = insertRow("20990101_inserted_after_startup");
    await vi.advanceTimersByTimeAsync(BACKGROUND_MIGRATION_RESCAN_INTERVAL_MS);

    await vi.waitFor(() => expect(row.finishedAt).toBeInstanceOf(Date));
    expect(migration.run).toHaveBeenCalledTimes(1);
  });

  it("does not validate a failed migration again on later scans", async () => {
    migration.validate.mockResolvedValue({
      valid: false,
      invalidReason: "invalid args",
    });
    const row = insertRow("20990101_invalid");

    BackgroundMigrationManager.start();
    await waitForScans(2);
    await vi.advanceTimersByTimeAsync(BACKGROUND_MIGRATION_RESCAN_INTERVAL_MS);
    await waitForScans(3);

    expect(row.failedAt).toBeInstanceOf(Date);
    expect(migration.validate).toHaveBeenCalledTimes(1);
    expect(migration.run).not.toHaveBeenCalled();
  });
});
