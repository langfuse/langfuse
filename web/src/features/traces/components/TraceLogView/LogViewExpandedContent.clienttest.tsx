import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LogViewExpandedContent } from "./LogViewExpandedContent";
import { useLogViewObservationIO } from "./useLogViewObservationIO";
import { type TreeNode } from "@/src/features/traces/types/treeNode";

vi.mock("./useLogViewObservationIO", () => ({
  useLogViewObservationIO: vi.fn(),
}));

describe("LogViewExpandedContent", () => {
  beforeEach(() => {
    vi.mocked(useLogViewObservationIO).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      isError: false,
    });
  });

  it("loads a session observation from its owning trace", () => {
    const startTime = new Date("2026-01-01T00:00:00.000Z");
    const node: TreeNode = {
      id: "trace-2:observation-2",
      observationId: "observation-2",
      traceId: "trace-2",
      type: "SPAN",
      name: "Sibling observation",
      startTime,
      children: [],
      startTimeSinceTrace: 0,
      startTimeSinceParentStart: null,
      depth: 0,
      childrenDepth: 0,
    };

    render(
      <LogViewExpandedContent
        node={node}
        traceId="trace-1"
        projectId="project-1"
      />,
    );

    expect(useLogViewObservationIO).toHaveBeenCalledWith({
      observationId: "observation-2",
      traceId: "trace-2",
      projectId: "project-1",
      startTime,
      enabled: true,
    });
  });
});
