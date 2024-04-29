import { expect, test, describe, vi } from "vitest";
import { createRedisEvents, evalQueue } from "../api";
import { QueueJobs, TraceUpsertEvent } from "@langfuse/shared";
import { randomUUID } from "crypto";
import { z } from "zod";
import logger from "../logger";
import { evalJobCreator } from "../redis/consumer";

describe.sequential("create redis events", () => {
  test("handle redis job succeeding", async () => {
    test("createRedisEvents function", async () => {
      const events = [
        { traceId: "trace1", projectId: "project1" },
        { traceId: "trace2", projectId: "project1" },
        { traceId: "trace3", projectId: "project2" },
      ];

      const jobs = createRedisEvents(events);

      expect(jobs).toBeDefined();
      expect(jobs.length).toBe(3);

      jobs.forEach((job) => {
        expect(job.name).toBe(QueueJobs.TraceUpsert);
        expect(job.data.id).toBeDefined();
        expect(job.data.timestamp).toBeDefined();
        expect(job.data.payload.projectId).toBeDefined();
        expect(job.data.payload.traceId).toBeDefined();
        expect(job.opts.removeOnFail).toBe(10000);
        expect(job.opts.removeOnComplete).toBe(true);
        expect(job.opts.attempts).toBe(5);
        expect(job.opts.backoff.type).toBe("exponential");
        expect(job.opts.backoff.delay).toBe(1000);
      });
    });
  });
});
