import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import {
  QueueJobs,
  QueueName,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";

const addToQueue = vi.fn();

vi.mock("../../services/ClickhouseWriter", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/ClickhouseWriter")
  >("../../services/ClickhouseWriter");
  return {
    ...actual,
    ClickhouseWriter: {
      getInstance: vi.fn(() => ({ addToQueue })),
    },
  };
});

import { auditLogQueueProcessor } from "../auditLogQueue";
import { TableName } from "../../services/ClickhouseWriter";

const validRow = {
  id: "row-1",
  timestamp: "2026-09-10 12:00:00.000",
  org_id: "org-1",
  project_id: "project-1",
  event_kind: "access" as const,
  actor_type: "USER" as const,
  user_id: "user-1",
  api_key_id: "",
  user_org_role: "OWNER",
  user_project_role: "OWNER",
  resource_type: "trace",
  resource_id: "trace-1",
  action: "read",
  surface: "trpc",
  route: "traces.byId",
  params: '{"traceId":"trace-1"}',
  result_count: 1,
  before: "",
  after: "",
};

const createJob = (payload: unknown) =>
  ({
    id: "job-1",
    data: {
      id: "row-1",
      timestamp: new Date(),
      name: QueueJobs.AuditLogJob,
      payload,
    },
  }) as unknown as Job<TQueueJobTypes[QueueName.AuditLogQueue]>;

describe("auditLogQueueProcessor", () => {
  beforeEach(() => {
    addToQueue.mockClear();
  });

  it("hands a valid row to the ClickHouse writer", async () => {
    await auditLogQueueProcessor(createJob(validRow));

    expect(addToQueue).toHaveBeenCalledTimes(1);
    expect(addToQueue).toHaveBeenCalledWith(TableName.AuditLogs, validRow);
  });

  it("drops a malformed row without failing the job", async () => {
    await expect(
      auditLogQueueProcessor(
        createJob({ ...validRow, event_kind: "unknown", result_count: -1 }),
      ),
    ).resolves.toBeUndefined();

    expect(addToQueue).not.toHaveBeenCalled();
  });
});
