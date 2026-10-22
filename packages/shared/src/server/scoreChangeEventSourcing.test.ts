import { afterEach, describe, expect, it, vi } from "vitest";
import { QueueJobs, QueueName } from "./queues";
import { ScoreChangeQueue } from "./redis/scoreChangeQueue";
import { scoreChangeEventSourcing } from "./scoreChangeEventSourcing";

const event = {
  projectId: "project-id",
  eventId: "event-id",
  action: "updated" as const,
  score: {
    id: "score-id",
    name: "quality",
    dataType: "TEXT",
    value: 0,
    stringValue: "Needs improvement",
    longStringValue: "Needs improvement",
    observationId: "observation-id",
  },
};

describe("scoreChangeEventSourcing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queues score changes on the dedicated queue", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(ScoreChangeQueue, "getInstance").mockReturnValue({ add } as never);

    await scoreChangeEventSourcing(event);

    expect(add).toHaveBeenCalledWith(
      QueueName.ScoreChangeQueue,
      expect.objectContaining({
        payload: event,
        name: QueueJobs.ScoreChangeJob,
      }),
    );
  });

  it("fails when the queue is unavailable", async () => {
    vi.spyOn(ScoreChangeQueue, "getInstance").mockReturnValue(null);

    await expect(scoreChangeEventSourcing(event)).rejects.toThrow(
      "Score change queue is not available",
    );
  });

  it("propagates queue insertion failures", async () => {
    const error = new Error("Redis unavailable");
    vi.spyOn(ScoreChangeQueue, "getInstance").mockReturnValue({
      add: vi.fn().mockRejectedValue(error),
    } as never);

    await expect(scoreChangeEventSourcing(event)).rejects.toBe(error);
  });
});
