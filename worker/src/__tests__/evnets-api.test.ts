import { expect, test, describe } from "vitest";
import { createRedisEvents } from "../api";

describe.sequential("create redis events", () => {
  test("deduplicate events from the same project id", async () => {
    const events = [
      { traceId: "trace1", projectId: "project1" },
      { traceId: "trace2", projectId: "project1" },
      { traceId: "trace2", projectId: "project2" },
      { traceId: "trace3", projectId: "project2" },
      { traceId: "trace3", projectId: "project2" },
    ];

    const jobs = createRedisEvents(events);

    expect(jobs).toBeDefined();
    expect(jobs.length).toBe(4);

    const traceIdProjectIds = jobs.map((event) => ({
      projectId: event.data.payload.projectId,
      traceId: event.data.payload.traceId,
    }));

    expect(traceIdProjectIds).toEqual([
      { traceId: "trace1", projectId: "project1" },
      { traceId: "trace2", projectId: "project1" },
      { traceId: "trace2", projectId: "project2" },
      { traceId: "trace3", projectId: "project2" },
    ]);
  });
});
