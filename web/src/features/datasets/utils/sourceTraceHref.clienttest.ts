import { describe, expect, it } from "vitest";

import { getSourceTraceHref } from "@/src/features/datasets/utils/sourceTraceHref";

describe("getSourceTraceHref", () => {
  it("links to the trace when no source observation is available", () => {
    expect(
      getSourceTraceHref({
        projectId: "project-1",
        sourceTraceId: "trace-1",
      }),
    ).toBe("/project/project-1/traces/trace-1");
  });

  it("links directly to the source observation when available", () => {
    expect(
      getSourceTraceHref({
        projectId: "project-1",
        sourceTraceId: "trace/1",
        sourceObservationId: "observation/1",
      }),
    ).toBe("/project/project-1/traces/trace%2F1?observation=observation%2F1");
  });
});
