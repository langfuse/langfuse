import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InAppAgentRunStatus } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  createInAppAgentConversationId,
  createInAppAgentRunId,
} from "@langfuse/shared/in-app-agent";

/**
 * The sweep's whole job is to select the right rows out of Postgres, so the
 * database is real here and only the queue is faked: what we assert about
 * delivery is which job IDs it asks for, not that BullMQ can enqueue.
 */
const queueRef = vi.hoisted(() => ({
  added: [] as Array<{ jobId: string | undefined; runId: string }>,
  removed: [] as string[],
  existingJob: null as {
    isFailed: () => Promise<boolean>;
    isCompleted: () => Promise<boolean>;
  } | null,
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();

  return {
    ...actual,
    InAppAgentRunQueue: {
      getInstance: () => ({
        add: async (
          _name: string,
          data: { payload: { runId: string } },
          opts?: { jobId?: string },
        ) => {
          queueRef.added.push({
            jobId: opts?.jobId,
            runId: data.payload.runId,
          });
        },
        getJob: async (jobId: string) =>
          queueRef.existingJob
            ? {
                ...queueRef.existingJob,
                remove: async () => {
                  queueRef.removed.push(jobId);
                },
              }
            : undefined,
      }),
    },
  };
});

import { runInAppAgentLifecycleRecovery } from "./lifecycleRecovery";

const ago = (ms: number) => new Date(Date.now() - ms);

async function seedConversation() {
  const { projectId } = await createOrgProjectAndApiKey();
  const user = await prisma.user.create({
    data: { email: `sweep-${randomUUID()}@langfuse.com`, name: "sweep-user" },
  });
  const conversation = await prisma.inAppAgentConversation.create({
    data: {
      id: createInAppAgentConversationId(),
      projectId,
      createdByUserId: user.id,
      title: "sweep test",
    },
  });

  return { projectId, conversationId: conversation.id, userId: user.id };
}

async function seedRun(
  ctx: { projectId: string; conversationId: string; userId: string },
  data: {
    status: InAppAgentRunStatus;
    createdAt: Date;
    claimedAt?: Date | null;
    heartbeatAt?: Date | null;
    mcpApiKeyId?: string | null;
  },
) {
  // Each run needs its own conversation: an unfinished run is unique per
  // conversation by partial index.
  const conversation = await prisma.inAppAgentConversation.create({
    data: {
      id: createInAppAgentConversationId(),
      projectId: ctx.projectId,
      createdByUserId: ctx.userId,
      title: "sweep test",
    },
  });

  return prisma.inAppAgentRun.create({
    data: {
      id: createInAppAgentRunId(),
      projectId: ctx.projectId,
      conversationId: conversation.id,
      triggeredByUserId: ctx.userId,
      claimedAt: null,
      heartbeatAt: null,
      ...data,
    },
  });
}

const reload = (run: { id: string; projectId: string }) =>
  prisma.inAppAgentRun.findUniqueOrThrow({
    where: { id_projectId: { id: run.id, projectId: run.projectId } },
  });

describe("in-app agent lifecycle recovery sweep", () => {
  beforeEach(() => {
    queueRef.added = [];
    queueRef.removed = [];
    queueRef.existingJob = null;
  });

  it("fails a claimed run whose heartbeat went stale and leaves a healthy one running", async () => {
    const ctx = await seedConversation();
    const abandoned = await seedRun(ctx, {
      status: InAppAgentRunStatus.RUNNING,
      createdAt: ago(5 * 60_000),
      claimedAt: ago(5 * 60_000),
      heartbeatAt: ago(90_000),
    });
    const healthy = await seedRun(ctx, {
      status: InAppAgentRunStatus.RUNNING,
      createdAt: ago(5 * 60_000),
      claimedAt: ago(5 * 60_000),
      heartbeatAt: new Date(),
    });

    await runInAppAgentLifecycleRecovery();

    expect(await reload(abandoned)).toMatchObject({
      status: InAppAgentRunStatus.FAILED,
      errorCode: "worker_lost",
    });
    expect(await reload(healthy)).toMatchObject({
      status: InAppAgentRunStatus.RUNNING,
      errorCode: null,
    });
  });

  it("revokes the credential of the run it terminalizes", async () => {
    const ctx = await seedConversation();
    const key = await prisma.apiKey.create({
      data: {
        projectId: ctx.projectId,
        scope: "PROJECT",
        isInAppAgentKey: true,
        publicKey: `pk-sweep-${randomUUID()}`,
        hashedSecretKey: `hsk-sweep-${randomUUID()}`,
        displaySecretKey: "sk-...abcd",
      },
    });
    const abandoned = await seedRun(ctx, {
      status: InAppAgentRunStatus.RUNNING,
      createdAt: ago(5 * 60_000),
      claimedAt: ago(5 * 60_000),
      heartbeatAt: ago(90_000),
      mcpApiKeyId: key.id,
    });

    await runInAppAgentLifecycleRecovery();

    // A worker killed mid-run never revoked the key it minted, and only this
    // pointer knows the key exists. Waiting for the hourly backstop would leave
    // an unowned project credential live for an hour.
    expect(await prisma.apiKey.count({ where: { id: key.id } })).toBe(0);
    expect((await reload(abandoned)).mcpApiKeyId).toBeNull();
  });

  it("never touches a foreground-shaped run", async () => {
    const ctx = await seedConversation();
    // Foreground runs insert as RUNNING with no claim, and the classifier's
    // 150s staleness branch would kill one mid-flight. No current predicate can
    // select them; this pins the property so a future branch keyed on
    // createdAt rather than a claim timestamp cannot reintroduce them.
    const foreground = await seedRun(ctx, {
      status: InAppAgentRunStatus.RUNNING,
      createdAt: ago(10 * 60_000),
      claimedAt: null,
      heartbeatAt: null,
    });

    await runInAppAgentLifecycleRecovery();

    expect(await reload(foreground)).toMatchObject({
      status: InAppAgentRunStatus.RUNNING,
      errorCode: null,
    });
  });

  it("redispatches a queued run past its dispatch delay, but not a fresh one", async () => {
    const ctx = await seedConversation();
    const stranded = await seedRun(ctx, {
      status: InAppAgentRunStatus.QUEUED,
      createdAt: ago(30_000),
    });
    const fresh = await seedRun(ctx, {
      status: InAppAgentRunStatus.QUEUED,
      createdAt: ago(2_000),
    });

    await runInAppAgentLifecycleRecovery();

    const redispatchedIds = queueRef.added.map((entry) => entry.jobId);
    expect(redispatchedIds).toContain(stranded.id);
    expect(redispatchedIds).not.toContain(fresh.id);
    // The deterministic job ID is what makes a duplicate delivery harmless.
    expect(
      queueRef.added.find((entry) => entry.jobId === stranded.id)?.runId,
    ).toBe(stranded.id);
    // Still QUEUED: delivery is best effort, the claim CAS promotes it.
    expect(await reload(stranded)).toMatchObject({
      status: InAppAgentRunStatus.QUEUED,
    });
  });

  it("clears a terminal job holding the run's ID before redispatching", async () => {
    const ctx = await seedConversation();
    const stranded = await seedRun(ctx, {
      status: InAppAgentRunStatus.QUEUED,
      createdAt: ago(30_000),
    });
    // A worker that died before its claim CAS leaves a failed job behind, and
    // `add` against a retained job ID is a silent no-op. Without the removal,
    // this run would never be redispatched again.
    queueRef.existingJob = {
      isFailed: async () => true,
      isCompleted: async () => false,
    };

    await runInAppAgentLifecycleRecovery();

    expect(queueRef.removed).toContain(stranded.id);
    expect(queueRef.added.map((entry) => entry.jobId)).toContain(stranded.id);
  });
});
