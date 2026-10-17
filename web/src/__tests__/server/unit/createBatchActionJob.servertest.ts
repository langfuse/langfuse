const fakeQueue = vi.hoisted(() => {
  type FakeJob = {
    id: string;
    data: { payload: { query: unknown; targetId?: string } };
    state: string;
    getState: () => Promise<string>;
    remove: () => Promise<void>;
  };

  const jobs = new Map<string, FakeJob>();

  const createJob = (
    id: string,
    data: FakeJob["data"],
    state: string,
  ): FakeJob => ({
    id,
    data,
    state,
    getState: async () => jobs.get(id)?.state ?? "unknown",
    remove: async () => {
      jobs.delete(id);
    },
  });

  return {
    jobs,
    seed(id: string, data: FakeJob["data"], state: string) {
      jobs.set(id, createJob(id, data, state));
    },
    getInstance() {
      return {
        add: async (
          _name: string,
          data: FakeJob["data"],
          opts?: { jobId?: string },
        ) => {
          const id = opts?.jobId;
          if (!id) {
            throw new Error("jobId is required");
          }
          const existing = jobs.get(id);
          if (existing) {
            return existing;
          }
          const job = createJob(id, data, "waiting");
          jobs.set(id, job);
          return job;
        },
        getJob: async (id: string) => jobs.get(id),
        getJobState: async (id: string) => jobs.get(id)?.state ?? "unknown",
      };
    },
    reset() {
      jobs.clear();
    },
  };
});

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServerModule>();
  return {
    ...actual,
    BatchActionQueue: {
      getInstance: () => fakeQueue.getInstance(),
    },
  };
});

vi.mock("@/src/features/audit-logs/server", () => ({
  auditLog: vi.fn(),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as SharedServerModule from "@langfuse/shared/src/server";
import {
  ActionId,
  BatchActionType,
  BatchExportTableName,
} from "@langfuse/shared";
import type { TRPCError } from "@trpc/server";
import { createBatchActionJob } from "@/src/features/table/server/createBatchActionJob";
import { generateBatchActionId } from "@/src/features/table/server/helpers";

const projectId = "project-batch-action-job-id";
const tableName = BatchExportTableName.Traces;
const actionId = ActionId.TraceAddToAnnotationQueue;
const batchActionId = generateBatchActionId(projectId, actionId, tableName);

const session = {
  user: { id: "user-1", v4BetaEnabled: false },
  orgId: "org-1",
  orgRole: "OWNER" as const,
};

const query = (value: string) => ({
  filter: [
    {
      column: "id",
      operator: "=" as const,
      value,
      type: "string" as const,
    },
  ],
  orderBy: { column: "timestamp", order: "DESC" as const },
});

describe("createBatchActionJob generic queue identity", () => {
  beforeEach(() => {
    fakeQueue.reset();
  });

  it("enqueues a later distinct operation after a failed job with the same class id is retained", async () => {
    fakeQueue.seed(
      batchActionId,
      {
        payload: {
          query: query("trace-a"),
          targetId: "queue-a",
        },
      },
      "failed",
    );

    await createBatchActionJob({
      projectId,
      actionId,
      tableName,
      actionType: BatchActionType.Create,
      session,
      query: query("trace-b"),
      targetId: "queue-b",
    });

    const job = fakeQueue.jobs.get(batchActionId);
    expect(job).toBeDefined();
    expect(job?.state).toBe("waiting");
    expect(job?.data.payload).toMatchObject({
      query: query("trace-b"),
      targetId: "queue-b",
    });
  });

  it("enqueues with the class job id when no retained job exists", async () => {
    await createBatchActionJob({
      projectId,
      actionId,
      tableName,
      actionType: BatchActionType.Create,
      session,
      query: query("trace-a"),
      targetId: "queue-a",
    });

    const job = fakeQueue.jobs.get(batchActionId);
    expect(job?.state).toBe("waiting");
    expect(job?.data.payload).toMatchObject({
      query: query("trace-a"),
      targetId: "queue-a",
    });
  });

  it("rejects a successor while a job of the same class is still in progress", async () => {
    fakeQueue.seed(
      batchActionId,
      {
        payload: {
          query: query("trace-a"),
          targetId: "queue-a",
        },
      },
      "active",
    );

    await expect(
      createBatchActionJob({
        projectId,
        actionId,
        tableName,
        actionType: BatchActionType.Create,
        session,
        query: query("trace-b"),
        targetId: "queue-b",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<TRPCError>);

    expect(fakeQueue.jobs.get(batchActionId)?.data.payload).toMatchObject({
      query: query("trace-a"),
      targetId: "queue-a",
    });
  });
});
