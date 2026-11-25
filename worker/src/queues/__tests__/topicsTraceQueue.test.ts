import { type Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordIncrement,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { processTopicsTrace } from "../../features/topics/processTopicsTrace";
import { topicsTraceQueueProcessorBuilder } from "../topicsTraceQueue";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  recordIncrement: vi.fn(),
  recordDistribution: vi.fn(),
}));
vi.mock("../../features/topics/processTopicsTrace", () => ({
  processTopicsTrace: vi.fn(),
}));

const job = (attemptsMade: number) =>
  ({
    data: {
      timestamp: new Date(),
      payload: {
        projectId: "project",
        traceId: "trace",
        revision: "revision",
        transcriptS3Path: "transcript.json",
        ruleIds: ["rule"],
      },
    },
    attemptsMade,
    opts: { attempts: 4 },
  }) as unknown as Job<TQueueJobTypes[QueueName.TopicsTrace]>;

describe("topics trace queue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts a trace as a platform failure only when its last attempt throws", async () => {
    vi.mocked(processTopicsTrace).mockRejectedValue(
      new Error("socket hang up"),
    );
    const process = topicsTraceQueueProcessorBuilder("topics-trace-queue");
    const failed = [
      "langfuse.topics.trace_outcomes",
      1,
      expect.objectContaining({
        outcome: "failed",
        reason: "job_failed",
        owner: "platform",
      }),
    ];

    await expect(process(job(0))).rejects.toThrow("socket hang up");
    expect(recordIncrement).not.toHaveBeenCalledWith(...failed);

    await expect(process(job(3))).rejects.toThrow("socket hang up");
    expect(recordIncrement).toHaveBeenCalledWith(...failed);
  });
});
