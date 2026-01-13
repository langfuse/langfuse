import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import {
  observationRetryDelayInMs,
  retryObservationNotFound,
} from "../features/evaluation/retryObservationNotFound";
import {
  DatasetRunItemUpsertQueue,
  RetryBaggage,
} from "@langfuse/shared/src/server";
import { ObservationNotFoundError } from "../errors/ObservationNotFoundError";

// Mock the queue
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    DatasetRunItemUpsertQueue: {
      getInstance: vi.fn(),
    },
  };
});

describe("Observation Retry Logic", () => {
  describe("observationRetryDelayInMs", () => {
    test("returns correct exponential backoff delays", () => {
      expect(observationRetryDelayInMs(1)).toBe(30 * 1000); // 30s
      expect(observationRetryDelayInMs(2)).toBe(60 * 1000); // 1m
      expect(observationRetryDelayInMs(3)).toBe(120 * 1000); // 2m
      expect(observationRetryDelayInMs(4)).toBe(240 * 1000); // 4m
    });

    test("continues exponential growth beyond attempt 4", () => {
      expect(observationRetryDelayInMs(5)).toBe(480 * 1000); // 8m
    });
  });

  describe("retryObservationNotFound", () => {
    let mockQueueAdd: ReturnType<typeof vi.fn>;
    let mockQueue: { add: typeof mockQueueAdd };

    beforeEach(() => {
      mockQueueAdd = vi.fn().mockResolvedValue(undefined);
      mockQueue = { add: mockQueueAdd };
      vi.mocked(DatasetRunItemUpsertQueue.getInstance).mockReturnValue(
        mockQueue as any,
      );
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    test("schedules retry on first failure", async () => {
      const error = new ObservationNotFoundError({
        message: "Test error",
        observationId: "obs-123",
      });

      const job = {
        data: {
          projectId: "project-1",
          datasetItemId: "item-1",
          traceId: "trace-1",
          observationId: "obs-123",
        },
      };

      const shouldRetry = await retryObservationNotFound(error, job);

      expect(shouldRetry).toBe(true);
      expect(mockQueueAdd).toHaveBeenCalledTimes(1);

      const addCall = mockQueueAdd.mock.calls[0];
      expect(addCall[0]).toBe("dataset-run-item-upsert");
      expect(addCall[1].payload.projectId).toBe("project-1");
      expect(addCall[1].payload.observationId).toBe("obs-123");
      expect(addCall[1].retryBaggage.attempt).toBe(1);
      expect(addCall[2].delay).toBe(30 * 1000); // 30s delay
    });

    test("increases attempt count on subsequent failures", async () => {
      const error = new ObservationNotFoundError({
        message: "Test error",
        observationId: "obs-123",
      });

      const job = {
        data: {
          projectId: "project-1",
          datasetItemId: "item-1",
          traceId: "trace-1",
          observationId: "obs-123",
          retryBaggage: {
            originalJobTimestamp: new Date(),
            attempt: 2,
          } as RetryBaggage,
        },
      };

      const shouldRetry = await retryObservationNotFound(error, job);

      expect(shouldRetry).toBe(true);
      expect(mockQueueAdd).toHaveBeenCalledTimes(1);

      const addCall = mockQueueAdd.mock.calls[0];
      expect(addCall[1].retryBaggage.attempt).toBe(3);
      expect(addCall[2].delay).toBe(120 * 1000); // 2m delay (attempt 3)
    });

    test("returns false when max attempts reached", async () => {
      const error = new ObservationNotFoundError({
        message: "Test error",
        observationId: "obs-123",
      });

      const job = {
        data: {
          projectId: "project-1",
          datasetItemId: "item-1",
          traceId: "trace-1",
          observationId: "obs-123",
          retryBaggage: {
            originalJobTimestamp: new Date(),
            attempt: 4,
          } as RetryBaggage,
        },
      };

      const shouldRetry = await retryObservationNotFound(error, job);

      expect(shouldRetry).toBe(false);
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    test("returns false when job is older than 10 minutes", async () => {
      const error = new ObservationNotFoundError({
        message: "Test error",
        observationId: "obs-123",
      });

      const oldTimestamp = new Date(Date.now() - 11 * 60 * 1000); // 11 minutes ago

      const job = {
        data: {
          projectId: "project-1",
          datasetItemId: "item-1",
          traceId: "trace-1",
          observationId: "obs-123",
          retryBaggage: {
            originalJobTimestamp: oldTimestamp,
            attempt: 1,
          } as RetryBaggage,
        },
      };

      const shouldRetry = await retryObservationNotFound(error, job);

      expect(shouldRetry).toBe(false);
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    test("preserves original timestamp across retries", async () => {
      const error = new ObservationNotFoundError({
        message: "Test error",
        observationId: "obs-123",
      });

      // Use a recent timestamp to avoid max age check
      const originalTimestamp = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago

      const job = {
        data: {
          projectId: "project-1",
          datasetItemId: "item-1",
          traceId: "trace-1",
          observationId: "obs-123",
          retryBaggage: {
            originalJobTimestamp: originalTimestamp,
            attempt: 2,
          } as RetryBaggage,
        },
      };

      await retryObservationNotFound(error, job);

      const addCall = mockQueueAdd.mock.calls[0];
      expect(addCall[1].retryBaggage.originalJobTimestamp).toEqual(
        originalTimestamp,
      );
    });

    test("includes all job data in retry payload", async () => {
      const error = new ObservationNotFoundError({
        message: "Test error",
        observationId: "obs-123",
      });

      const job = {
        data: {
          projectId: "project-1",
          datasetItemId: "item-1",
          traceId: "trace-1",
          observationId: "obs-123",
        },
      };

      await retryObservationNotFound(error, job);

      const addCall = mockQueueAdd.mock.calls[0];
      const payload = addCall[1].payload;
      expect(payload.projectId).toBe("project-1");
      expect(payload.datasetItemId).toBe("item-1");
      expect(payload.traceId).toBe("trace-1");
      expect(payload.observationId).toBe("obs-123");
    });

    test("handles job without observationId", async () => {
      const error = new ObservationNotFoundError({
        message: "Test error",
        observationId: "obs-123",
      });

      const job = {
        data: {
          projectId: "project-1",
          datasetItemId: "item-1",
          traceId: "trace-1",
          observationId: undefined,
        },
      };

      const shouldRetry = await retryObservationNotFound(error, job);

      expect(shouldRetry).toBe(true);
      const addCall = mockQueueAdd.mock.calls[0];
      expect(addCall[1].payload.observationId).toBeUndefined();
    });

    test("applies correct delay for each attempt", async () => {
      const error = new ObservationNotFoundError({
        message: "Test error",
        observationId: "obs-123",
      });

      const attempts = [
        { attempt: 0, expectedDelay: 30 * 1000 }, // Attempt 1: 30s
        { attempt: 1, expectedDelay: 60 * 1000 }, // Attempt 2: 1m
        { attempt: 2, expectedDelay: 120 * 1000 }, // Attempt 3: 2m
        { attempt: 3, expectedDelay: 240 * 1000 }, // Attempt 4: 4m
      ];

      for (const { attempt, expectedDelay } of attempts) {
        vi.clearAllMocks();

        const job = {
          data: {
            projectId: "project-1",
            datasetItemId: "item-1",
            traceId: "trace-1",
            observationId: "obs-123",
            retryBaggage:
              attempt > 0
                ? ({
                    originalJobTimestamp: new Date(),
                    attempt,
                  } as RetryBaggage)
                : undefined,
          },
        };

        await retryObservationNotFound(error, job);

        const addCall = mockQueueAdd.mock.calls[0];
        expect(addCall[2].delay).toBe(expectedDelay);
      }
    });
  });
});
