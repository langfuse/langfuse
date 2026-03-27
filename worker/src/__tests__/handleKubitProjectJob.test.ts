import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";

// ── Hoisted mock state ────────────────────────────────────────────────────────
// vi.mock factories are hoisted before imports, so any values they close over
// must be created with vi.hoisted to be available at factory evaluation time.

const { mockAcquire, mockRelease, mockEnv } = vi.hoisted(() => ({
  mockAcquire: vi.fn<[], Promise<"acquired" | "held_by_other" | "skipped">>(),
  mockRelease: vi.fn<[], Promise<boolean>>(),
  mockEnv: {
    LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE: "false" as "true" | "false",
  },
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    kubitIntegration: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  getCurrentSpan: vi.fn().mockReturnValue(null),
  getTracesForKubit: vi.fn(),
  getObservationsForKubit: vi.fn(),
  getScoresForKubit: vi.fn(),
  getEventsForKubit: vi.fn(),
  QueueName: {
    KubitIntegrationProcessingQueue: "KubitIntegrationProcessingQueue",
  },
}));

vi.mock("@langfuse/shared/encryption", () => ({
  decrypt: vi.fn((v: string) => v),
  encrypt: vi.fn((v: string) => v),
}));

vi.mock("../utils/RedisLock", () => ({
  RedisLock: vi.fn().mockImplementation(() => ({
    acquire: mockAcquire,
    release: mockRelease,
  })),
}));

vi.mock("../env", () => ({ env: mockEnv }));

// ── Imports (resolved after mocks are registered) ─────────────────────────────

import { handleKubitProjectJob } from "../features/kubit/handleKubitProjectJob";
import { prisma } from "@langfuse/shared/src/db";
import {
  getTracesForKubit,
  getObservationsForKubit,
  getScoresForKubit,
  getEventsForKubit,
} from "@langfuse/shared/src/server";

// ── Helpers ───────────────────────────────────────────────────────────────────

type KubitJob = Job<TQueueJobTypes[QueueName.KubitIntegrationProcessingQueue]>;

function makeJob(projectId = "project-123"): KubitJob {
  return {
    data: { id: "job-1", payload: { projectId } },
  } as unknown as KubitJob;
}

/** Returns a db row with valid AWS credentials (expiry 2h from now). */
function makeIntegration(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    projectId: "project-123",
    endpointUrl: "https://langfuse-ingest.kubit.ai",
    encryptedApiKey: "enc-api-key",
    enabled: true,
    syncIntervalMinutes: 60,
    requestTimeoutSeconds: 30,
    encryptedAwsAccessKeyId: "enc-access-key",
    encryptedAwsSecretAccessKey: "enc-secret-key",
    encryptedAwsSessionToken: "enc-session-token",
    awsCredentialsExpiry: new Date(Date.now() + 2 * 60 * 60 * 1000),
    awsKinesisStreamName: "test-stream",
    awsKinesisRegion: "us-east-1",
    awsKinesisPartitionKey: "workspace-123",
    lastSyncAt: null,
    lastError: null,
    currentSyncMaxTimestamp: null,
    tracesSyncedAt: null,
    observationsSyncedAt: null,
    eventsSyncedAt: null,
    scoresSyncedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

/** Async generator that yields the given items then returns. */
async function* makeGenerator<T>(...items: T[]) {
  for (const item of items) yield item;
}

/** Async generator that throws immediately. */
async function* throwingGenerator(message = "processor error") {
  throw new Error(message);
  // eslint-disable-next-line no-unreachable
  yield undefined as never;
}

/**
 * Stubs global fetch to handle both the Kubit token endpoint and Kinesis.
 * Returns the mock so individual tests can override it.
 */
function stubFetch({
  tokenStatus = 200,
}: { tokenStatus?: number } = {}): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (url: string, init: RequestInit) => {
    if ((url as string).includes("kinesis.")) {
      const parsed = JSON.parse(init.body as string);
      return {
        ok: true,
        json: async () => ({
          FailedRecordCount: 0,
          Records: parsed.Records.map(() => ({
            SequenceNumber: "seq-1",
            ShardId: "shardId-000000000000",
          })),
        }),
        text: async () => "",
      } as unknown as Response;
    }

    // Token endpoint
    if (tokenStatus !== 200) {
      return {
        ok: false,
        status: tokenStatus,
        text: async () => "Unauthorized",
      } as unknown as Response;
    }

    return {
      ok: true,
      json: async () => ({
        credentials: {
          AccessKeyId: "ASIA_NEW_KEY",
          SecretAccessKey: "new-secret",
          SessionToken: "new-session-token",
        },
        metadata: {
          partition_key: "workspace-123",
          stream_name: "test-stream",
          region: "us-east-1",
          expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
        },
      }),
      text: async () => "",
    } as unknown as Response;
  });

  vi.stubGlobal("fetch", mock);
  return mock;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: lock is acquired and released successfully
  mockAcquire.mockResolvedValue("acquired");
  mockRelease.mockResolvedValue(true);

  // Default: all generators yield nothing (processors complete cleanly)
  vi.mocked(getTracesForKubit).mockReturnValue(makeGenerator());
  vi.mocked(getObservationsForKubit).mockReturnValue(makeGenerator());
  vi.mocked(getScoresForKubit).mockReturnValue(makeGenerator());
  vi.mocked(getEventsForKubit).mockReturnValue(makeGenerator());

  // Default: all prisma calls succeed
  vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
    makeIntegration() as never,
  );
  vi.mocked(prisma.kubitIntegration.update).mockResolvedValue(
    makeIntegration() as never,
  );

  stubFetch();

  // Default: V4 pipeline disabled (legacy mode)
  mockEnv.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE = "false";
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("handleKubitProjectJob", () => {
  // ── Early exits ─────────────────────────────────────────────────────────────

  describe("early exits", () => {
    it("returns without processing when no enabled integration exists", async () => {
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(null);

      await handleKubitProjectJob(makeJob());

      expect(mockAcquire).not.toHaveBeenCalled();
      expect(prisma.kubitIntegration.update).not.toHaveBeenCalled();
      expect(getTracesForKubit).not.toHaveBeenCalled();
    });

    it("returns without processing when the lock is held by another worker", async () => {
      mockAcquire.mockResolvedValue("held_by_other");

      await handleKubitProjectJob(makeJob());

      expect(getTracesForKubit).not.toHaveBeenCalled();
      expect(prisma.kubitIntegration.update).not.toHaveBeenCalled();
      // We return before the try block, so release is never called
      expect(mockRelease).not.toHaveBeenCalled();
    });

    it("proceeds without lock when Redis is unavailable (skipped)", async () => {
      mockAcquire.mockResolvedValue("skipped");

      await handleKubitProjectJob(makeJob());

      expect(getTracesForKubit).toHaveBeenCalled();
    });

    it("returns without throwing when credentials fail permanently (401)", async () => {
      // Credentials expired so a refresh is attempted
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({
          encryptedAwsAccessKeyId: null,
          awsCredentialsExpiry: null,
        }) as never,
      );
      stubFetch({ tokenStatus: 401 });

      await expect(handleKubitProjectJob(makeJob())).resolves.toBeUndefined();

      // Integration is disabled
      expect(prisma.kubitIntegration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ enabled: false }),
        }),
      );
      // Lock is still released (we're inside the try block)
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  // ── Lock lifecycle ───────────────────────────────────────────────────────────

  describe("lock lifecycle", () => {
    it("releases the lock after a successful run", async () => {
      await handleKubitProjectJob(makeJob());

      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("releases the lock even when a processor fails", async () => {
      vi.mocked(getTracesForKubit).mockReturnValue(throwingGenerator());

      await expect(handleKubitProjectJob(makeJob())).rejects.toThrow();

      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("uses the projectId as the lock key", async () => {
      const { RedisLock } = await import("../utils/RedisLock");

      await handleKubitProjectJob(makeJob("my-project-id"));

      expect(RedisLock).toHaveBeenCalledWith(
        "kubit:lock:my-project-id",
        expect.any(Object),
      );
    });
  });

  // ── Sync window ──────────────────────────────────────────────────────────────

  describe("sync window management", () => {
    it("persists currentSyncMaxTimestamp on the first attempt", async () => {
      const before = Date.now();
      await handleKubitProjectJob(makeJob());
      const after = Date.now();

      // Find the update call that sets currentSyncMaxTimestamp
      const windowUpdate = vi
        .mocked(prisma.kubitIntegration.update)
        .mock.calls.find(([args]) => "currentSyncMaxTimestamp" in args.data);

      expect(windowUpdate).toBeDefined();
      const ts = (windowUpdate![0].data as Record<string, unknown>)
        .currentSyncMaxTimestamp as Date;
      expect(ts.getTime()).toBeGreaterThanOrEqual(before);
      expect(ts.getTime()).toBeLessThanOrEqual(after);
    });

    it("reuses the existing currentSyncMaxTimestamp on retry", async () => {
      const pinnedTs = new Date("2026-01-01T10:00:00.000Z");
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({ currentSyncMaxTimestamp: pinnedTs }) as never,
      );

      await handleKubitProjectJob(makeJob());

      // Should NOT write a new currentSyncMaxTimestamp
      const windowUpdate = vi
        .mocked(prisma.kubitIntegration.update)
        .mock.calls.find(
          ([args]) =>
            args.data !== null &&
            "currentSyncMaxTimestamp" in args.data &&
            args.data.currentSyncMaxTimestamp !== null,
        );

      expect(windowUpdate).toBeUndefined();

      // Final cleanup should clear it
      const cleanupUpdate = vi
        .mocked(prisma.kubitIntegration.update)
        .mock.calls.find(
          ([args]) => args.data.currentSyncMaxTimestamp === null,
        );
      expect(cleanupUpdate).toBeDefined();
    });

    it("passes the pinned maxTimestamp to all processors", async () => {
      const pinnedTs = new Date("2026-01-01T10:00:00.000Z");
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({ currentSyncMaxTimestamp: pinnedTs }) as never,
      );

      await handleKubitProjectJob(makeJob());

      // Each generator function is called with (projectId, minTs, maxTs)
      expect(getTracesForKubit).toHaveBeenCalledWith(
        "project-123",
        expect.any(Date),
        pinnedTs,
      );
      expect(getObservationsForKubit).toHaveBeenCalledWith(
        "project-123",
        expect.any(Date),
        pinnedTs,
      );
      expect(getScoresForKubit).toHaveBeenCalledWith(
        "project-123",
        expect.any(Date),
        pinnedTs,
      );
    });
  });

  // ── Per-processor skip ───────────────────────────────────────────────────────

  describe("per-processor skip on retry", () => {
    it("skips traces when tracesSyncedAt >= currentSyncMaxTimestamp", async () => {
      const ts = new Date("2026-01-01T10:00:00.000Z");
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({
          currentSyncMaxTimestamp: ts,
          tracesSyncedAt: ts,
        }) as never,
      );

      await handleKubitProjectJob(makeJob());

      expect(getTracesForKubit).not.toHaveBeenCalled();
      expect(getObservationsForKubit).toHaveBeenCalled();
      expect(getScoresForKubit).toHaveBeenCalled();
    });

    it("skips observations when observationsSyncedAt >= currentSyncMaxTimestamp", async () => {
      const ts = new Date("2026-01-01T10:00:00.000Z");
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({
          currentSyncMaxTimestamp: ts,
          observationsSyncedAt: ts,
        }) as never,
      );

      await handleKubitProjectJob(makeJob());

      expect(getTracesForKubit).toHaveBeenCalled();
      expect(getObservationsForKubit).not.toHaveBeenCalled();
      expect(getScoresForKubit).toHaveBeenCalled();
    });

    it("skips scores when scoresSyncedAt >= currentSyncMaxTimestamp", async () => {
      const ts = new Date("2026-01-01T10:00:00.000Z");
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({
          currentSyncMaxTimestamp: ts,
          scoresSyncedAt: ts,
        }) as never,
      );

      await handleKubitProjectJob(makeJob());

      expect(getTracesForKubit).toHaveBeenCalled();
      expect(getObservationsForKubit).toHaveBeenCalled();
      expect(getScoresForKubit).not.toHaveBeenCalled();
    });

    it("skips all processors when all are already synced", async () => {
      const ts = new Date("2026-01-01T10:00:00.000Z");
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({
          currentSyncMaxTimestamp: ts,
          tracesSyncedAt: ts,
          observationsSyncedAt: ts,
          scoresSyncedAt: ts,
        }) as never,
      );

      await handleKubitProjectJob(makeJob());

      expect(getTracesForKubit).not.toHaveBeenCalled();
      expect(getObservationsForKubit).not.toHaveBeenCalled();
      expect(getScoresForKubit).not.toHaveBeenCalled();

      // Still performs the final cleanup
      const cleanupUpdate = vi
        .mocked(prisma.kubitIntegration.update)
        .mock.calls.find(([args]) => "lastSyncAt" in args.data);
      expect(cleanupUpdate).toBeDefined();
    });

    it("does not skip when syncedAt is set but is older than currentSyncMaxTimestamp", async () => {
      const oldTs = new Date("2026-01-01T08:00:00.000Z");
      const currentTs = new Date("2026-01-01T10:00:00.000Z");
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({
          currentSyncMaxTimestamp: currentTs,
          // syncedAt from a previous window — should not count as done
          tracesSyncedAt: oldTs,
        }) as never,
      );

      await handleKubitProjectJob(makeJob());

      expect(getTracesForKubit).toHaveBeenCalled();
    });
  });

  // ── Success path ─────────────────────────────────────────────────────────────

  describe("success path", () => {
    it("marks each processor done individually after it completes", async () => {
      await handleKubitProjectJob(makeJob());

      const updateCalls = vi
        .mocked(prisma.kubitIntegration.update)
        .mock.calls.map(([args]) => Object.keys(args.data));

      const hasSyncedAt = (key: string) =>
        updateCalls.some((keys) => keys.includes(key));

      expect(hasSyncedAt("tracesSyncedAt")).toBe(true);
      expect(hasSyncedAt("observationsSyncedAt")).toBe(true);
      expect(hasSyncedAt("scoresSyncedAt")).toBe(true);
    });

    it("advances lastSyncAt to the sync window maxTimestamp on completion", async () => {
      const pinnedTs = new Date("2026-01-01T10:00:00.000Z");
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({ currentSyncMaxTimestamp: pinnedTs }) as never,
      );

      await handleKubitProjectJob(makeJob());

      const cleanupUpdate = vi
        .mocked(prisma.kubitIntegration.update)
        .mock.calls.find(([args]) => args.data.lastSyncAt !== undefined);

      expect(cleanupUpdate).toBeDefined();
      expect(
        (cleanupUpdate![0].data as Record<string, unknown>).lastSyncAt,
      ).toEqual(pinnedTs);
    });

    it("clears all tracking columns after a complete run", async () => {
      await handleKubitProjectJob(makeJob());

      const cleanupUpdate = vi
        .mocked(prisma.kubitIntegration.update)
        .mock.calls.find(([args]) => "lastSyncAt" in args.data);

      expect(cleanupUpdate).toBeDefined();
      const data = cleanupUpdate![0].data as Record<string, unknown>;
      expect(data.currentSyncMaxTimestamp).toBeNull();
      expect(data.tracesSyncedAt).toBeNull();
      expect(data.observationsSyncedAt).toBeNull();
      expect(data.scoresSyncedAt).toBeNull();
      expect(data.lastError).toBeNull();
    });
  });

  // ── Failure path ─────────────────────────────────────────────────────────────

  describe("failure path", () => {
    it("throws when any processor fails", async () => {
      vi.mocked(getTracesForKubit).mockReturnValue(
        throwingGenerator("kinesis throttled"),
      );

      await expect(handleKubitProjectJob(makeJob())).rejects.toThrow(
        "kinesis throttled",
      );
    });

    it("marks successful processors as done even when another fails", async () => {
      vi.mocked(getTracesForKubit).mockReturnValue(throwingGenerator());
      // observations and scores succeed (empty generators)

      await expect(handleKubitProjectJob(makeJob())).rejects.toThrow();

      const updateCalls = vi
        .mocked(prisma.kubitIntegration.update)
        .mock.calls.map(([args]) => Object.keys(args.data));

      const hasSyncedAt = (key: string) =>
        updateCalls.some((keys) => keys.includes(key));

      // Failed processor is NOT marked done
      expect(hasSyncedAt("tracesSyncedAt")).toBe(false);
      // Succeeded processors ARE marked done
      expect(hasSyncedAt("observationsSyncedAt")).toBe(true);
      expect(hasSyncedAt("scoresSyncedAt")).toBe(true);
    });

    it("writes lastError to DB when a processor fails", async () => {
      vi.mocked(getTracesForKubit).mockReturnValue(
        throwingGenerator("kinesis throttled"),
      );

      await expect(handleKubitProjectJob(makeJob())).rejects.toThrow();

      const errorUpdate = vi
        .mocked(prisma.kubitIntegration.update)
        .mock.calls.find(
          ([args]) => "lastError" in args.data && args.data.lastError !== null,
        );

      expect(errorUpdate).toBeDefined();
      expect(
        (errorUpdate![0].data as Record<string, unknown>).lastError,
      ).toContain("kinesis throttled");
    });

    it("does not advance lastSyncAt when any processor fails", async () => {
      vi.mocked(getScoresForKubit).mockReturnValue(throwingGenerator());

      await expect(handleKubitProjectJob(makeJob())).rejects.toThrow();

      const lastSyncUpdate = vi
        .mocked(prisma.kubitIntegration.update)
        .mock.calls.find(([args]) => "lastSyncAt" in args.data);

      expect(lastSyncUpdate).toBeUndefined();
    });

    it("waits for all processors to finish before throwing (allSettled behaviour)", async () => {
      // traces throws immediately; observations and scores are slow
      const observationsDone = vi.fn();
      const scoresDone = vi.fn();

      vi.mocked(getTracesForKubit).mockReturnValue(throwingGenerator());
      vi.mocked(getObservationsForKubit).mockImplementation(async function* () {
        await new Promise((r) => setTimeout(r, 10));
        observationsDone();
      });
      vi.mocked(getScoresForKubit).mockImplementation(async function* () {
        await new Promise((r) => setTimeout(r, 10));
        scoresDone();
      });

      await expect(handleKubitProjectJob(makeJob())).rejects.toThrow();

      // Both slow processors must have completed before the job threw
      expect(observationsDone).toHaveBeenCalled();
      expect(scoresDone).toHaveBeenCalled();
    });
  });

  // ── Credential refresh ───────────────────────────────────────────────────────

  describe("credential refresh", () => {
    it("refreshes credentials when they are expired and uses the new ones", async () => {
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({
          encryptedAwsAccessKeyId: null,
          awsCredentialsExpiry: null,
        }) as never,
      );

      await handleKubitProjectJob(makeJob());

      // Credentials are saved after refresh
      const credentialUpdate = vi
        .mocked(prisma.kubitIntegration.update)
        .mock.calls.find(([args]) => "encryptedAwsAccessKeyId" in args.data);

      expect(credentialUpdate).toBeDefined();
      expect(
        (credentialUpdate![0].data as Record<string, unknown>)
          .encryptedAwsAccessKeyId,
      ).toBeTruthy();
    });

    it("does not call the token endpoint when credentials are still valid", async () => {
      const fetchMock = stubFetch();

      await handleKubitProjectJob(makeJob());

      const tokenCalls = fetchMock.mock.calls.filter(([url]) =>
        (url as string).includes("/token"),
      );
      expect(tokenCalls).toHaveLength(0);
    });

    it("refreshes credentials expiring within 5 minutes (buffer window)", async () => {
      const fetchMock = stubFetch();
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({
          // Expiry is 4 minutes away — inside the 5-minute refresh buffer
          awsCredentialsExpiry: new Date(Date.now() + 4 * 60 * 1000),
        }) as never,
      );

      await handleKubitProjectJob(makeJob());

      const tokenCalls = fetchMock.mock.calls.filter(([url]) =>
        (url as string).includes("/token"),
      );
      expect(tokenCalls).toHaveLength(1);
    });

    it("disables the integration and returns cleanly on 403", async () => {
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({
          encryptedAwsAccessKeyId: null,
          awsCredentialsExpiry: null,
        }) as never,
      );
      stubFetch({ tokenStatus: 403 });

      await expect(handleKubitProjectJob(makeJob())).resolves.toBeUndefined();

      expect(prisma.kubitIntegration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ enabled: false }),
        }),
      );
    });

    it("throws (does not disable) on transient token endpoint errors (500)", async () => {
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({
          encryptedAwsAccessKeyId: null,
          awsCredentialsExpiry: null,
        }) as never,
      );
      stubFetch({ tokenStatus: 500 });

      await expect(handleKubitProjectJob(makeJob())).rejects.toThrow();

      // Integration must NOT be disabled — this is retryable
      const disableCall = vi
        .mocked(prisma.kubitIntegration.update)
        .mock.calls.find(([args]) => args.data.enabled === false);
      expect(disableCall).toBeUndefined();
    });
  });

  // ── Sync cursor (minTimestamp) ────────────────────────────────────────────────

  describe("sync cursor (minTimestamp)", () => {
    it("uses lastSyncAt as minTimestamp when set", async () => {
      const lastSync = new Date("2026-01-01T08:00:00.000Z");
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({ lastSyncAt: lastSync }) as never,
      );

      await handleKubitProjectJob(makeJob());

      expect(getTracesForKubit).toHaveBeenCalledWith(
        "project-123",
        lastSync,
        expect.any(Date),
      );
    });

    it("falls back to year 2000 when lastSyncAt is null (first ever sync)", async () => {
      await handleKubitProjectJob(makeJob());

      const [, minTs] = vi.mocked(getTracesForKubit).mock.calls[0];
      expect(minTs).toEqual(new Date("2000-01-01"));
    });
  });

  // ── Pipeline mode routing ─────────────────────────────────────────────────────

  describe("pipeline mode routing", () => {
    it("legacy mode (V4 disabled): calls traces, observations, scores — not events", async () => {
      // mockEnv defaults to LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE = "false"
      await handleKubitProjectJob(makeJob());

      expect(getTracesForKubit).toHaveBeenCalled();
      expect(getObservationsForKubit).toHaveBeenCalled();
      expect(getScoresForKubit).toHaveBeenCalled();
      expect(getEventsForKubit).not.toHaveBeenCalled();
    });

    it("V4 mode (env enabled): calls events and scores — not traces or observations", async () => {
      mockEnv.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE = "true";

      await handleKubitProjectJob(makeJob());

      expect(getEventsForKubit).toHaveBeenCalled();
      expect(getScoresForKubit).toHaveBeenCalled();
      expect(getTracesForKubit).not.toHaveBeenCalled();
      expect(getObservationsForKubit).not.toHaveBeenCalled();
    });

    it("V4 mode: passes the correct timestamps to getEventsForKubit", async () => {
      mockEnv.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE = "true";
      const pinnedTs = new Date("2026-01-01T10:00:00.000Z");
      const lastSync = new Date("2026-01-01T08:00:00.000Z");
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({
          currentSyncMaxTimestamp: pinnedTs,
          lastSyncAt: lastSync,
        }) as never,
      );

      await handleKubitProjectJob(makeJob());

      expect(getEventsForKubit).toHaveBeenCalledWith(
        "project-123",
        lastSync,
        pinnedTs,
      );
    });

    it("V4 mode: marks eventsSyncedAt after completion", async () => {
      mockEnv.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE = "true";

      await handleKubitProjectJob(makeJob());

      const eventsUpdate = vi
        .mocked(prisma.kubitIntegration.update)
        .mock.calls.find(
          ([args]) =>
            "eventsSyncedAt" in args.data && args.data.eventsSyncedAt !== null,
        );
      expect(eventsUpdate).toBeDefined();
    });

    it("V4 mode: skips events when eventsSyncedAt >= currentSyncMaxTimestamp", async () => {
      mockEnv.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE = "true";
      const ts = new Date("2026-01-01T10:00:00.000Z");
      vi.mocked(prisma.kubitIntegration.findFirst).mockResolvedValue(
        makeIntegration({
          currentSyncMaxTimestamp: ts,
          eventsSyncedAt: ts,
        }) as never,
      );

      await handleKubitProjectJob(makeJob());

      expect(getEventsForKubit).not.toHaveBeenCalled();
      expect(getScoresForKubit).toHaveBeenCalled();
    });

    it("V4 mode: clears eventsSyncedAt in final cleanup", async () => {
      mockEnv.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE = "true";

      await handleKubitProjectJob(makeJob());

      const cleanupUpdate = vi
        .mocked(prisma.kubitIntegration.update)
        .mock.calls.find(([args]) => "lastSyncAt" in args.data);

      expect(cleanupUpdate).toBeDefined();
      const data = cleanupUpdate![0].data as Record<string, unknown>;
      expect(data.eventsSyncedAt).toBeNull();
    });

    it("V4 mode: events failure does not prevent scores from completing", async () => {
      mockEnv.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE = "true";
      vi.mocked(getEventsForKubit).mockReturnValue(
        throwingGenerator("events table unavailable"),
      );

      await expect(handleKubitProjectJob(makeJob())).rejects.toThrow(
        "events table unavailable",
      );

      const updateCalls = vi
        .mocked(prisma.kubitIntegration.update)
        .mock.calls.map(([args]) => Object.keys(args.data));

      const hasSyncedAt = (key: string) =>
        updateCalls.some((keys) => keys.includes(key));

      // Events failed — NOT marked done
      expect(
        updateCalls.some(
          (keys) =>
            keys.includes("eventsSyncedAt") &&
            vi
              .mocked(prisma.kubitIntegration.update)
              .mock.calls.find(([args]) => "eventsSyncedAt" in args.data)?.[0]
              .data.eventsSyncedAt !== null,
        ),
      ).toBe(false);

      // Scores completed and IS marked done
      expect(hasSyncedAt("scoresSyncedAt")).toBe(true);
    });
  });
});
