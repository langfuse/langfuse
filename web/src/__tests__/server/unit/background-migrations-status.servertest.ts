import { randomUUID } from "node:crypto";
import type { Session } from "next-auth";

import { env } from "@/src/env.mjs";
import { backgroundMigrationsRouter } from "@/src/features/background-migrations/server/background-migrations-router";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { type BackgroundMigration } from "@langfuse/shared";

// Real gate declared in the worker env (worker/src/env.ts); the status endpoint
// mirrors the worker's gate discovery, which only considers env vars with the
// LANGFUSE_BACKGROUND_MIGRATION_ prefix.
const GATE = "LANGFUSE_BACKGROUND_MIGRATION_V4_DROP_PID_TID_SORTING_TABLES";
const UNPREFIXED_GATE = "SOME_UNRELATED_FLAG";

const session: Session = {
  expires: "1",
  user: {
    id: `background-migrations-user-${randomUUID()}`,
    canCreateOrganizations: true,
    name: "Background Migrations Test User",
    organizations: [],
    featureFlags: {
      searchBar: false,
      excludeClickhouseRead: false,
      templateFlag: true,
      v4BetaToggleVisible: false,
      observationEvals: false,
      experimentsV4Enabled: false,
    },
    admin: false,
  },
  environment: {
    enableExperimentalFeatures: false,
    selfHostedInstancePlan: "oss",
  },
};

const migrationRow = (
  overrides: Partial<BackgroundMigration>,
): BackgroundMigration => ({
  id: randomUUID(),
  name: `migration-${randomUUID()}`,
  script: "noop",
  args: {},
  state: {},
  finishedAt: null,
  failedAt: null,
  failedReason: null,
  workerId: null,
  lockedAt: null,
  ...overrides,
});

const createCaller = (migrations: BackgroundMigration[]) => {
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return backgroundMigrationsRouter.createCaller({
    ...ctx,
    prisma: {
      backgroundMigration: {
        findMany: async () => migrations,
      },
    } as unknown as typeof ctx.prisma,
  });
};

describe("backgroundMigrations.status", () => {
  const envRecord = env as unknown as Record<string, string | undefined>;
  const originalCloudRegion = envRecord.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalGate = envRecord[GATE];
  const originalUnprefixedGate = envRecord[UNPREFIXED_GATE];

  beforeEach(() => {
    // The endpoint is self-host only; the local dev .env marks the test
    // process as cloud ("DEV"), which would trip the cloud guard.
    envRecord.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    envRecord[GATE] = "false";
  });

  afterEach(() => {
    envRecord.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    envRecord[GATE] = originalGate;
    if (originalUnprefixedGate === undefined) {
      delete envRecord[UNPREFIXED_GATE];
    } else {
      envRecord[UNPREFIXED_GATE] = originalUnprefixedGate;
    }
  });

  it("reports FINISHED when the only pending migrations are dormant behind inactive env gates", async () => {
    const caller = createCaller([
      migrationRow({ args: { envGate: GATE } }),
      migrationRow({ finishedAt: new Date() }),
    ]);

    await expect(caller.status()).resolves.toEqual({ status: "FINISHED" });
  });

  it("reports ACTIVE when a pending migration's env gate is set to true", async () => {
    envRecord[GATE] = "true";
    const caller = createCaller([migrationRow({ args: { envGate: GATE } })]);

    await expect(caller.status()).resolves.toEqual({ status: "ACTIVE" });
  });

  it("reports ACTIVE for a gated pending migration already claimed by a worker", async () => {
    // Gates only need to be set on the worker for a migration to run, so a
    // claimed row counts as active even when the web container lacks the gate.
    const caller = createCaller([
      migrationRow({ args: { envGate: GATE }, workerId: randomUUID() }),
    ]);

    await expect(caller.status()).resolves.toEqual({ status: "ACTIVE" });
  });

  it("reports ACTIVE for ungated pending migrations", async () => {
    const caller = createCaller([migrationRow({})]);

    await expect(caller.status()).resolves.toEqual({ status: "ACTIVE" });
  });

  it("ignores gates without the LANGFUSE_BACKGROUND_MIGRATION_ prefix like the worker does", async () => {
    envRecord[UNPREFIXED_GATE] = "true";
    const caller = createCaller([
      migrationRow({ args: { envGate: UNPREFIXED_GATE } }),
    ]);

    await expect(caller.status()).resolves.toEqual({ status: "FINISHED" });
  });

  it("reports FAILED when any migration failed, even a dormant one", async () => {
    const caller = createCaller([
      migrationRow({
        args: { envGate: GATE },
        failedAt: new Date(),
        failedReason: "boom",
      }),
    ]);

    await expect(caller.status()).resolves.toEqual({ status: "FAILED" });
  });

  it("reports FINISHED when all migrations finished", async () => {
    const caller = createCaller([migrationRow({ finishedAt: new Date() })]);

    await expect(caller.status()).resolves.toEqual({ status: "FINISHED" });
  });
});
