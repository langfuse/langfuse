import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  topicProcessingConfigSchema,
  type TopicFacet,
} from "@langfuse/shared/topics";
import { TopicPipelineForm } from "./TopicPipelineForm";
import type { TopicTraceSelection } from "./TopicTraceSelector";

const selection = vi.hoisted(() => ({
  value: null as TopicTraceSelection | null,
}));
const trigger = vi.hoisted(() => vi.fn());
vi.mock("./TopicTraceSelector", () => ({
  TopicTraceSelector: ({
    children,
  }: {
    children: (value: TopicTraceSelection | null) => ReactNode;
  }) => children(selection.value),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      currentResults: { useQuery: () => ({ data: [] }) },
      trigger: {
        useMutation: () => ({ mutateAsync: trigger, isPending: false }),
      },
    },
    useUtils: () => ({
      topics: {
        runs: { invalidate: vi.fn() },
        executions: { invalidate: vi.fn() },
      },
    }),
  },
}));

describe("Topics pipeline selection handoff", () => {
  it("requires a reviewed selection, sends its exact IDs and all facets, and blocks an invalidated selection", async () => {
    const facets: TopicFacet[] = ["Intent", "Issues"].map((name) => ({
      id: name.toLowerCase(),
      projectId: "project",
      name,
      description: "",
      publishedRunId: null,
      versions: [
        {
          id: `${name.toLowerCase()}-v1`,
          projectId: "project",
          facetId: name.toLowerCase(),
          version: 1,
          prompt: `Describe ${name}`,
          createdAt: "2026-09-16T00:00:00Z",
          processingConfig: topicProcessingConfigSchema.parse({}),
        },
      ],
    }));
    const onTriggered = vi.fn();
    const props = {
      projectId: "project",
      facets,
      runs: [],
      executions: [],
      canWrite: true,
      onTriggered,
    };
    selection.value = null;
    trigger.mockResolvedValue({ id: "execution" });
    const view = render(<TopicPipelineForm {...props} />);
    expect(
      screen
        .getByRole("button", { name: "Run topics" })
        .hasAttribute("disabled"),
    ).toBe(true);
    selection.value = {
      traceIds: ["trace-with/custom-id", "second-trace"],
      count: 2,
    };
    view.rerender(<TopicPipelineForm {...props} />);
    fireEvent.change(screen.getByLabelText("Embedding dimensions"), {
      target: { value: "512" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Force refresh" }));
    fireEvent.click(screen.getByRole("button", { name: "Run topics" }));
    await waitFor(() => expect(onTriggered).toHaveBeenCalledWith("execution"));
    expect(trigger).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "refresh",
        projectId: "project",
        traceIds: ["trace-with/custom-id", "second-trace"],
        facetVersionIds: ["intent-v1", "issues-v1"],
        embeddingConfig: {
          embeddingModel: "text-embedding-3-small",
          embeddingDimensions: 512,
        },
        forceRefresh: true,
      }),
    );
    selection.value = {
      count: 10000,
      selection: {
        filter: [],
        from: new Date("2026-09-15T00:00:00Z"),
        to: new Date("2026-09-16T00:00:00Z"),
        limit: null,
        sampling: "random",
        seed: "preview-seed",
        excludedTraceIds: ["excluded-trace"],
      },
    };
    view.rerender(<TopicPipelineForm {...props} />);
    expect(screen.getByText(/Run on 10,000 traces/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run topics" }));
    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(2));
    expect(trigger.mock.calls[1][0]).toMatchObject({
      selection: selection.value.selection,
    });
    expect(trigger.mock.calls[1][0]).not.toHaveProperty("traceIds");
    selection.value = null;
    view.rerender(<TopicPipelineForm {...props} />);
    expect(
      screen
        .getByRole("button", { name: "Run topics" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
