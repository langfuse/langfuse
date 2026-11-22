import { expect, test, describe, vi, afterEach } from "vitest";
import { randomUUID } from "crypto";
import {
  EvalExecutionQueue,
  QueueJobs,
  QueueName,
  TraceUpsertQueue,
} from "@langfuse/shared/src/server";
import { WorkerManager } from "../queues/workerManager";

describe.sequential("handle redis events", () => {
  afterEach(async () => {
    await WorkerManager.closeWorkers();
  });

  test("handle redis job succeeding", async () => {
    const shardingKey = "project-id-trace-id";
    const traceUpsertQueue = TraceUpsertQueue.getInstance({ shardingKey });
    const shardNames = TraceUpsertQueue.getShardNames();

    // Register workers for all shards since we don't know which one will be used
    shardNames.forEach((shardName) => {
      WorkerManager.register(shardName as QueueName, async () => true);
    });

    expect(traceUpsertQueue).toBeDefined();

    const job = await traceUpsertQueue?.add(
      QueueJobs.TraceUpsert,
      {
        id: randomUUID(),
        timestamp: new Date(),
        payload: {
          projectId: "project-id",
          traceId: "trace-id",
        },
        name: QueueJobs.TraceUpsert as const,
      },
      { delay: 0 },
    );

    await vi.waitFor(
      async () => {
        const jobState = await traceUpsertQueue?.getJobState(job!.id!);
        expect(jobState).toEqual("completed");
      },
      {
        timeout: 35_000,
      },
    );
  }, 35_000);

  test("handle sharded eval execution job succeeding", async () => {
    const shardingKey = "project-id-job-execution-id";
    const evalExecutionQueue = EvalExecutionQueue.getInstance({ shardingKey });
    const shardNames = EvalExecutionQueue.getShardNames();

    shardNames.forEach((shardName) => {
      WorkerManager.register(shardName as QueueName, async () => true);
    });

    expect(evalExecutionQueue).toBeDefined();

    const job = await evalExecutionQueue?.add(
      QueueJobs.EvaluationExecution,
      {
        id: randomUUID(),
        timestamp: new Date(),
        payload: {
          projectId: "project-id",
          jobExecutionId: "job-execution-id",
          delay: 0,
        },
        name: QueueJobs.EvaluationExecution,
      },
      {
        removeOnComplete: false,
      },
    );

    await vi.waitFor(
      async () => {
        const jobState = await evalExecutionQueue?.getJobState(job!.id!);
        expect(jobState).toEqual("completed");
      },
      {
        timeout: 35_000,
      },
    );
  }, 35_000);

  test("handle no matching queue worker", async () => {
    // IngestionQueue worker vs TraceUpsert producer
    WorkerManager.register(QueueName.IngestionQueue, async () => true);

    const shardingKey = "project-id-trace-id";
    const traceUpsertQueue = TraceUpsertQueue.getInstance({ shardingKey });

    expect(traceUpsertQueue).toBeDefined();

    const job = await traceUpsertQueue?.add(
      QueueJobs.TraceUpsert,
      {
        id: randomUUID(),
        timestamp: new Date(),
        payload: {
          projectId: "project-id",
          traceId: "trace-id",
        },
        name: QueueJobs.TraceUpsert as const,
      },
      { delay: 0 },
    );

    // Wait for 2s
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Job should still be waiting as there is no listener
    const jobState = await traceUpsertQueue?.getJobState(job!.id!);
    expect(jobState).toEqual("waiting");
  }, 5000);
});
