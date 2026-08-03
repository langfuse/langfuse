import { buildTraceDetailPath } from "@/src/utils/navigation";

describe("buildTraceDetailPath", () => {
  it("builds a trace path without query params", () => {
    expect(
      buildTraceDetailPath({
        projectId: "project-1",
        traceId: "trace/1",
      }),
    ).toBe("/project/project-1/traces/trace%2F1");
  });

  it("adds observation and timestamp query params", () => {
    expect(
      buildTraceDetailPath({
        projectId: "project-1",
        traceId: "trace-1",
        observationId: "observation-1",
        timestamp: new Date("2026-03-08T18:27:00.703Z"),
      }),
    ).toBe(
      "/project/project-1/traces/trace-1?observation=observation-1&timestamp=2026-03-08T18%3A27%3A00.703Z",
    );
  });

  it("normalizes an encoded timestamp string", () => {
    expect(
      buildTraceDetailPath({
        projectId: "project-1",
        traceId: "trace-1",
        observationId: "observation-1",
        timestamp: "2026-03-08T18%3A27%3A00.703Z",
      }),
    ).toBe(
      "/project/project-1/traces/trace-1?observation=observation-1&timestamp=2026-03-08T18%3A27%3A00.703Z",
    );
  });
});
