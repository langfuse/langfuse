import { expect, test, describe } from "vitest";
import { createRedisEvents } from "../api";
import { QueueJobs } from "@langfuse/shared";

describe.sequential("create redis events", () => {
  test("handle redis job succeeding", async () => {
    test("createRedisEvents function", async () => {
      const events = [
        { traceId: "trace1", projectId: "project1" },
        { traceId: "trace2", projectId: "project1" },
        { traceId: "trace3", projectId: "project2" },
        { traceId: "trace3", projectId: "project2" },
      ];

      const jobs = createRedisEvents(events);

      expect(jobs).toBeDefined();
      expect(jobs.length).toBe(3);

      const traceIdProjectIds = events.map((event) => ({
        projectId: event.projectId,
        traceId: event.traceId,
      }));

      expect(traceIdProjectIds).toEqual([
        { projectId: "project1", traceId: "trace1" },
        { projectId: "project1", traceId: "trace2" },
        { projectId: "project2", traceId: "trace3" },
      ]);
    });
  });
});
