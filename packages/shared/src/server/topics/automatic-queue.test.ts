import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Job, Queue, Worker } from "bullmq";
import { env } from "../../env";
import { prisma } from "../../db";
import { QueueJobs, type TopicAutomaticJob } from "../queues";
import * as executionStore from "./execution-store";
import {
  AutomaticTopicsQueue,
  enqueueAutomaticTopicAssignments,
  enqueueAutomaticTopicDiscovery,
} from "./automatic-queue";
import {
  TopicsUpdateQueue,
  enqueueTopicExecution,
  getTopicExecutionQueueState,
  registerTopicExecutionQueueJob,
} from "./queue";
import { redis } from "../redis/redis";
import type { TopicExecutionSummary } from "../../topics";

vi.mock("./config", () => ({
  isTopicsEnabled: () => true,
  isTopicsProjectEnabled: (projectId: string) => projectId !== "disabled",
}));

afterEach(() => vi.restoreAllMocks());

const assignmentScope = {
  facets: [{ facetId: "facet", version: 1 }],
  embeddingConfig: {
    embeddingModel: "embedding-model",
    embeddingDimensions: 1024,
  },
};

describe("automatic Topics queue", () => {
  it("batches assignment references without changing accepted scope", async () => {
    const add = vi.fn();
    vi.spyOn(AutomaticTopicsQueue, "getInstance").mockReturnValue({
      add,
    } as unknown as Queue<TopicAutomaticJob>);
    const traceIds = Array.from(
      { length: 101 },
      (_, index) => `trace-${index}`,
    );
    const timeRange = {
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-09-08T00:00:00.000Z"),
    };
    await enqueueAutomaticTopicAssignments({
      projectId: "project",
      traceIds,
      timeRange,
      batchId: "batch",
      ...assignmentScope,
    });
    expect(
      add.mock.calls.map(([, data]) => data.payload.traceIds.length),
    ).toEqual([100, 1]);
    expect(add.mock.calls.flatMap(([, data]) => data.payload.traceIds)).toEqual(
      traceIds,
    );
    for (const [, data] of add.mock.calls) {
      expect(data.payload).toMatchObject({
        projectId: "project",
        timeRange,
        ...assignmentScope,
      });
    }
  });

  it("retries disabled projects but discards confirmed deletions", async () => {
    const project = vi.spyOn(prisma.project, "findUnique").mockResolvedValue({
      id: "disabled",
    } as Awaited<ReturnType<typeof prisma.project.findUnique>>);
    const queue = vi.spyOn(AutomaticTopicsQueue, "getInstance");
    const input = {
      projectId: "disabled",
      traceIds: ["trace"],
      batchId: "batch",
      ...assignmentScope,
    };
    await expect(enqueueAutomaticTopicAssignments(input)).rejects.toThrow(
      "admission is disabled for this project.",
    );
    project.mockResolvedValue(null);
    await expect(
      enqueueAutomaticTopicAssignments(input),
    ).resolves.toBeUndefined();
    expect(queue).not.toHaveBeenCalled();
  });

  it("retains independent facet follow-ups across concurrent workers", async () => {
    const connection = env.REDIS_CONNECTION_STRING
      ? { url: env.REDIS_CONNECTION_STRING }
      : {
          host: env.REDIS_HOST ?? "localhost",
          port: env.REDIS_PORT ?? 6379,
          password: env.REDIS_AUTH ?? undefined,
          username: env.REDIS_USERNAME ?? undefined,
        };
    const queue = new Queue<TopicAutomaticJob>(
      `topics-facets-test-${randomUUID()}`,
      { connection },
    );
    vi.spyOn(AutomaticTopicsQueue, "getInstance").mockReturnValue(queue);
    let release: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started: (() => void) | undefined;
    const active = new Promise<void>((resolve) => {
      started = resolve;
    });
    let bothStarted: (() => void) | undefined;
    const bothActive = new Promise<void>((resolve) => {
      bothStarted = resolve;
    });
    let completed: (() => void) | undefined;
    const done = new Promise<void>((resolve) => {
      completed = resolve;
    });
    const seen: string[] = [];
    const worker = new Worker<TopicAutomaticJob>(
      queue.name,
      async (job) => {
        const facetId = job.data.payload.facets![0].facetId;
        const first = !seen.includes(facetId);
        seen.push(facetId);
        if (seen.length === 1) started!();
        if (new Set(seen).size === 2) bothStarted!();
        if (first) await hold;
        if (seen.length === 4) completed!();
      },
      { connection, concurrency: 4 },
    );
    try {
      await enqueueAutomaticTopicDiscovery("project", [
        { facetId: "intent", version: 1 },
      ]);
      await active;
      await enqueueAutomaticTopicDiscovery("project", [
        { facetId: "issues", version: 1 },
      ]);
      const counts = await queue.getJobCounts("active", "waiting");
      expect(counts.active + counts.waiting).toBe(2);
      await bothActive;
      for (let index = 0; index < 3; index++)
        await enqueueAutomaticTopicDiscovery("project", [
          { facetId: "intent", version: 1 },
          { facetId: "issues", version: 1 },
        ]);
      release!();
      await done;
      await worker.close();
      expect(seen.filter((id) => id === "intent")).toHaveLength(2);
      expect(seen.filter((id) => id === "issues")).toHaveLength(2);
    } finally {
      release!();
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });

  it("preserves a promoted discovery's ownership through failure and Resume", async () => {
    const connection = env.REDIS_CONNECTION_STRING
      ? { url: env.REDIS_CONNECTION_STRING }
      : {
          host: env.REDIS_HOST ?? "localhost",
          port: env.REDIS_PORT ?? 6379,
          password: env.REDIS_AUTH ?? undefined,
          username: env.REDIS_USERNAME ?? undefined,
        };
    const queue = new Queue<TopicAutomaticJob>(
      `topics-promoted-owner-test-${randomUUID()}`,
      { connection },
    );
    vi.spyOn(AutomaticTopicsQueue, "getInstance").mockReturnValue(queue);
    vi.spyOn(TopicsUpdateQueue, "getInstance").mockReturnValue(
      queue as unknown as NonNullable<
        ReturnType<typeof TopicsUpdateQueue.getInstance>
      >,
    );
    const projectId = randomUUID();
    let releaseFirst: (() => void) | undefined;
    const firstHold = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstStarted: (() => void) | undefined;
    const firstActive = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    let releaseNext: (() => void) | undefined;
    const nextHold = new Promise<void>((resolve) => {
      releaseNext = resolve;
    });
    let nextStarted: (() => void) | undefined;
    const nextActive = new Promise<void>((resolve) => {
      nextStarted = resolve;
    });
    let promoted: Job<TopicAutomaticJob> | undefined;
    const setBinding = vi.spyOn(redis!, "set");
    let runs = 0;
    const worker = new Worker<TopicAutomaticJob>(
      queue.name,
      async (current) => {
        runs++;
        if (runs === 1) {
          firstStarted!();
          await firstHold;
        } else if (runs === 2) {
          promoted = current;
          await registerTopicExecutionQueueJob(
            projectId,
            current.data.payload.executionId!,
            current.id!,
          );
          nextStarted!();
          await nextHold;
          throw new Error("Naming temporarily unavailable");
        }
      },
      { connection },
    );
    try {
      await enqueueAutomaticTopicDiscovery(projectId, [
        { facetId: "facet", version: 1 },
      ]);
      await firstActive;
      await enqueueAutomaticTopicDiscovery(projectId, [
        { facetId: "facet", version: 1 },
      ]);
      releaseFirst!();
      await nextActive;
      expect(promoted!.id).not.toBe(promoted!.data.payload.executionId);
      const execution = {
        id: promoted!.data.payload.executionId!,
        projectId,
        status: "running",
        input: { operation: "update" },
      } as TopicExecutionSummary;
      vi.spyOn(executionStore, "readTopicExecutionSummary").mockResolvedValue(
        execution,
      );
      expect(await getTopicExecutionQueueState(execution)).toBe("active");
      await enqueueTopicExecution(projectId, execution.id);
      expect(await queue.getWaitingCount()).toBe(0);
      const failed = new Promise<void>((resolve) =>
        worker.once("failed", () => resolve()),
      );
      releaseNext!();
      await failed;
      await worker.pause();
      expect(
        await queue.getDeduplicationJobId(promoted!.deduplicationId!),
      ).toBeNull();
      execution.status = "failed";
      expect(await getTopicExecutionQueueState(execution)).toBe("failed");
      await enqueueTopicExecution(projectId, execution.id);
      expect((await queue.getWaiting()).map((current) => current.id)).toEqual([
        promoted!.id,
      ]);
      expect((await queue.getJob(promoted!.id!))?.data.name).toBe(
        QueueJobs.TopicsAutomatic,
      );
      const completed = new Promise<void>((resolve) =>
        worker.once("completed", () => resolve()),
      );
      await worker.resume();
      await completed;
      expect(runs).toBe(3);
    } finally {
      releaseFirst!();
      releaseNext!();
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
      for (const [key] of setBinding.mock.calls)
        if (String(key).startsWith("topics:execution-job:"))
          await redis!.del(key);
    }
  });
});
