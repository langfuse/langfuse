import { randomUUID } from "crypto";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  queryClickhouse,
  redis,
  stageAuditLogEvents,
} from "@langfuse/shared/src/server";
import {
  AuditLogRelay,
  insertAuditLogRecords,
} from "../features/audit-log-relay";

const stageChangeEvents = (orgId: string, count: number) =>
  stageAuditLogEvents(
    Array.from({ length: count }, () => ({
      kind: "change" as const,
      orgId,
      projectId: "project-1",
      actor: { type: "USER" as const, userId: "user-1" },
      resourceType: "prompt",
      resourceId: "prompt-1",
      action: "update",
      before: { version: 1 },
      after: { version: 2 },
    })),
  );

const stagedIds = async (): Promise<string[]> =>
  (
    await prisma.auditLogStaging.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
    })
  ).map((row) => row.id);

// FINAL applies the ReplacingMergeTree collapse that a read with
// LIMIT 1 BY id would.
const auditLogIds = async (orgId: string): Promise<string[]> =>
  (
    await queryClickhouse<{ id: string }>({
      query:
        "SELECT id FROM audit_logs FINAL WHERE org_id = {orgId: String} ORDER BY id",
      params: { orgId },
    })
  ).map((row) => row.id);

const sorted = (ids: string[]) => [...ids].sort();

// A lease of its own keeps a test clear of other tests and of a local worker.
const testLockKey = () => `langfuse:test:audit-log-relay:${randomUUID()}`;

describe("AuditLogRelay", () => {
  // The relay claims every staged row, not only the ones a test staged.
  beforeEach(async () => {
    await prisma.auditLogStaging.deleteMany();
  });

  it("deletes staged rows only after ClickHouse acknowledged the insert", async () => {
    const orgId = randomUUID();
    const ids = await stageChangeEvents(orgId, 3);
    let stagedDuringInsert: string[] = [];
    const relay = new AuditLogRelay({
      insertRecords: async (records, abortSignal) => {
        stagedDuringInsert = await stagedIds();
        await insertAuditLogRecords(records, abortSignal);
      },
    });

    await expect(relay.relayBatch()).resolves.toEqual({
      claimed: 3,
      relayed: 3,
      failed: 0,
    });

    expect(stagedDuringInsert).toEqual(sorted(ids));
    expect(await stagedIds()).toEqual([]);
    expect(await auditLogIds(orgId)).toEqual(sorted(ids));
  });

  it("leaves the rows in place when the ClickHouse insert fails", async () => {
    const orgId = randomUUID();
    const ids = await stageChangeEvents(orgId, 2);
    const relay = new AuditLogRelay({
      insertRecords: async () => {
        throw new Error("ClickHouse unavailable");
      },
    });

    await expect(relay.relayBatch()).rejects.toThrow("ClickHouse unavailable");

    const rows = await prisma.auditLogStaging.findMany({
      where: { id: { in: ids } },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.failedAt)).toEqual([null, null]);

    await expect(new AuditLogRelay().relayBatch()).resolves.toMatchObject({
      relayed: 2,
    });
    expect(await auditLogIds(orgId)).toEqual(sorted(ids));
  });

  it("collapses rows that are inserted again after a lost acknowledgement", async () => {
    const orgId = randomUUID();
    const ids = await stageChangeEvents(orgId, 2);
    let inserts = 0;
    const lostAck = new AuditLogRelay({
      insertRecords: async (records, abortSignal) => {
        await insertAuditLogRecords(records, abortSignal);
        inserts += 1;
        throw new Error("connection reset");
      },
    });

    await expect(lostAck.relayBatch()).rejects.toThrow("connection reset");
    expect(await stagedIds()).toEqual(sorted(ids));

    const relay = new AuditLogRelay({
      insertRecords: async (records, abortSignal) => {
        await insertAuditLogRecords(records, abortSignal);
        inserts += 1;
      },
    });
    await expect(relay.relayBatch()).resolves.toMatchObject({ relayed: 2 });

    expect(inserts).toBe(2);
    expect(await stagedIds()).toEqual([]);
    expect(await auditLogIds(orgId)).toEqual(sorted(ids));
  });

  it("never lets concurrent batches claim the same rows", async () => {
    const orgId = randomUUID();
    const ids = await stageChangeEvents(orgId, 6);
    const claimedByBatch: string[][] = [];
    let releaseInserts!: () => void;
    const bothBatchesClaimed = new Promise<void>((resolve) => {
      releaseInserts = resolve;
    });
    const relay = new AuditLogRelay({
      batchSize: 3,
      insertRecords: async (records, abortSignal) => {
        claimedByBatch.push(records.map((record) => record.id));
        if (claimedByBatch.length === 2) releaseInserts();
        // Holds the first batch's row locks until the second batch claimed.
        await Promise.race([
          bothBatchesClaimed,
          new Promise((resolve) => setTimeout(resolve, 5_000)),
        ]);
        await insertAuditLogRecords(records, abortSignal);
      },
    });

    const results = await Promise.all([relay.relayBatch(), relay.relayBatch()]);

    expect(results.map((result) => result.claimed)).toEqual([3, 3]);
    const [first, second] = claimedByBatch;
    expect(first.filter((id) => second.includes(id))).toEqual([]);
    expect(sorted([...first, ...second])).toEqual(sorted(ids));
    expect(await stagedIds()).toEqual([]);
    expect(await auditLogIds(orgId)).toEqual(sorted(ids));
  });

  it("marks a row it cannot map as failed and retries it after a delay", async () => {
    const orgId = randomUUID();
    const [validId] = await stageChangeEvents(orgId, 1);
    const { payload } = await prisma.auditLogStaging.findUniqueOrThrow({
      where: { id: validId },
    });
    // A value that a newer web version may write before this worker knows it.
    const failingId = uuidv7();
    await prisma.auditLogStaging.create({
      data: {
        id: failingId,
        createdAt: new Date(),
        payload: { ...(payload as object), surface: "grpc" },
      },
    });
    const relay = new AuditLogRelay();
    const shiftFailedAtBack = () => prisma.$executeRaw`
      UPDATE audit_log_staging
      SET failed_at = failed_at - INTERVAL '11 minutes'
      WHERE id = ${failingId}::uuid
    `;

    await expect(relay.relayBatch()).resolves.toEqual({
      claimed: 2,
      relayed: 1,
      failed: 1,
    });
    const failed = await prisma.auditLogStaging.findUniqueOrThrow({
      where: { id: failingId },
    });
    expect(failed.failedAt).not.toBeNull();
    expect(failed.lastError).toContain("surface");
    expect(await auditLogIds(orgId)).toEqual([validId]);

    // Not claimed again before the retry delay has passed.
    await expect(relay.relayBatch()).resolves.toMatchObject({ claimed: 0 });

    await shiftFailedAtBack();
    await expect(relay.relayBatch()).resolves.toMatchObject({
      claimed: 1,
      failed: 1,
    });
    const retried = await prisma.auditLogStaging.findUniqueOrThrow({
      where: { id: failingId },
    });
    expect(retried.failedAt!.getTime()).toBeGreaterThan(
      failed.failedAt!.getTime(),
    );

    // Stands in for a worker that knows the newer schema.
    await prisma.auditLogStaging.update({
      where: { id: failingId },
      data: { payload },
    });
    await shiftFailedAtBack();
    await expect(relay.relayBatch()).resolves.toEqual({
      claimed: 1,
      relayed: 1,
      failed: 0,
    });
    expect(await stagedIds()).toEqual([]);
    expect(await auditLogIds(orgId)).toEqual(sorted([validId, failingId]));
  });

  it("runs again right away while batches come back full", async (ctx) => {
    if (!redis) ctx.skip("Redis must be available for the lease");
    await stageChangeEvents(randomUUID(), 3);
    const relay = new AuditLogRelay({ batchSize: 2, lockKey: testLockKey() });

    await expect(relay.processBatch()).resolves.toBe(0);
    await expect(relay.processBatch()).resolves.toBeUndefined();
    expect(await stagedIds()).toEqual([]);
    relay.stop();
  });

  it("relays only on the task that holds the lease", async (ctx) => {
    if (!redis) ctx.skip("Redis must be available for the lease");
    const lockKey = testLockKey();
    const leader = new AuditLogRelay({ lockKey, lockTtlSeconds: 10 });
    const follower = new AuditLogRelay({ lockKey, lockTtlSeconds: 10 });

    await expect(leader.processBatch()).resolves.toBeUndefined();
    const ids = await stageChangeEvents(randomUUID(), 1);

    // Checks the lease again after half its TTL, without relaying.
    await expect(follower.processBatch()).resolves.toBe(5_000);
    expect(await stagedIds()).toEqual(ids);

    await expect(leader.processBatch()).resolves.toBeUndefined();
    expect(await stagedIds()).toEqual([]);

    leader.stop();
    await vi.waitFor(async () => {
      await expect(follower.processBatch()).resolves.toBeUndefined();
    });
    follower.stop();
  });

  it("hands the lease over after repeated failed batches", async (ctx) => {
    if (!redis) ctx.skip("Redis must be available for the lease");
    const lockKey = testLockKey();
    const failing = new AuditLogRelay({
      lockKey,
      lockTtlSeconds: 10,
      intervalMs: 1_000,
      insertRecords: async () => {
        throw new Error("ClickHouse unreachable from this task");
      },
    });
    const healthy = new AuditLogRelay({ lockKey, lockTtlSeconds: 10 });
    await stageChangeEvents(randomUUID(), 1);

    // Backs off while keeping the lease, then waits like a follower.
    await expect(failing.processBatch()).resolves.toBe(2_000);
    await expect(failing.processBatch()).resolves.toBe(4_000);
    await expect(healthy.processBatch()).resolves.toBe(5_000);
    await expect(failing.processBatch()).resolves.toBe(5_000);

    await expect(healthy.processBatch()).resolves.toBeUndefined();
    expect(await stagedIds()).toEqual([]);
    failing.stop();
    healthy.stop();
  });

  it("keeps its lease when a renewal fails but Redis still holds it", async (ctx) => {
    if (!redis) ctx.skip("Redis must be available for the lease");
    const lockKey = testLockKey();
    const leader = new AuditLogRelay({ lockKey, lockTtlSeconds: 10 });
    const follower = new AuditLogRelay({ lockKey, lockTtlSeconds: 10 });
    await expect(leader.processBatch()).resolves.toBeUndefined();
    await stageChangeEvents(randomUUID(), 1);
    // RedisLock.extend() reports a Redis error during renewal as false.
    vi.spyOn(leader["lock"], "extend").mockResolvedValueOnce(false);

    await expect(leader.processBatch()).resolves.toBeUndefined();
    expect(await stagedIds()).toEqual([]);
    await expect(follower.processBatch()).resolves.toBe(5_000);
    leader.stop();
    follower.stop();
  });

  it("releases a lease it acquires while being stopped", async (ctx) => {
    if (!redis) ctx.skip("Redis must be available for the lease");
    const lockKey = testLockKey();
    const stopping = new AuditLogRelay({ lockKey, lockTtlSeconds: 10 });
    const next = new AuditLogRelay({ lockKey, lockTtlSeconds: 10 });
    const lock = stopping["lock"];
    const acquire = lock.acquire.bind(lock);
    vi.spyOn(lock, "acquire").mockImplementationOnce(async () => {
      stopping.stop();
      return acquire();
    });

    await stopping.processBatch();

    await vi.waitFor(async () => {
      await expect(next.processBatch()).resolves.toBeUndefined();
    });
    next.stop();
  });
});
