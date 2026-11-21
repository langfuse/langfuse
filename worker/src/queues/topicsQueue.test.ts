import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  refit: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock("@langfuse/shared/src/server", () => ({
  QueueJobs: { Topics: "topics", TopicsRuleRefit: "topics-rule-refit" },
}));
vi.mock("@langfuse/shared/topics/server", () => ({
  isTopicsProjectEnabled: mocks.enabled,
}));
vi.mock("../features/topics/processTopicsExecution", () => ({
  processTopicUpdateExecution: mocks.update,
  processTopicRuleRefit: mocks.refit,
}));

import { topicsUpdateQueueProcessor } from "./topicsQueue";

type UpdateJob = Parameters<typeof topicsUpdateQueueProcessor>[0];
const updateJob = {
  data: {
    name: "topics",
    payload: { projectId: "project", executionId: "execution" },
  },
} as unknown as UpdateJob;
const refitJob = {
  data: {
    name: "topics-rule-refit",
    payload: { projectId: "project", runId: "run" },
  },
} as unknown as UpdateJob;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockReturnValue(true);
});

describe("Topics update queue", () => {
  it("rejects jobs of projects outside the allowlist before processing", async () => {
    mocks.enabled.mockReturnValue(false);
    for (const job of [updateJob, refitJob])
      await expect(topicsUpdateQueueProcessor(job)).rejects.toBeInstanceOf(
        UnrecoverableError,
      );
    expect(mocks.enabled).toHaveBeenCalledWith("project");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.refit).not.toHaveBeenCalled();
  });

  it("routes snapshot fits and rule refits to their own handlers", async () => {
    await topicsUpdateQueueProcessor(updateJob);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      projectId: "project",
      executionId: "execution",
    });
    expect(mocks.refit).not.toHaveBeenCalled();
    await topicsUpdateQueueProcessor(refitJob);
    expect(mocks.refit).toHaveBeenCalledExactlyOnceWith({
      projectId: "project",
      runId: "run",
    });
    expect(mocks.update).toHaveBeenCalledOnce();
  });
});
