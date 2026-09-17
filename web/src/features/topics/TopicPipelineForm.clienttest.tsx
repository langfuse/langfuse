import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  topicProcessingConfigSchema,
  type TopicFacet,
} from "@langfuse/shared/topics";
import { TopicPipelineForm } from "./TopicPipelineForm";

const selection = vi.hoisted(() => ({ ids: null as string[] | null }));
const trigger = vi.hoisted(() => vi.fn());
vi.mock("./TopicTraceSelector", () => ({
  TopicTraceSelector: ({
    children,
  }: {
    children: (ids: string[] | null) => ReactNode;
  }) => children(selection.ids),
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
    selection.ids = null;
    trigger.mockResolvedValue({ id: "execution" });
    const view = render(<TopicPipelineForm {...props} />);
    expect(
      screen
        .getByRole("button", { name: "Run topics" })
        .hasAttribute("disabled"),
    ).toBe(true);
    selection.ids = ["trace-with/custom-id", "second-trace"];
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
    selection.ids = null;
    view.rerender(<TopicPipelineForm {...props} />);
    expect(
      screen
        .getByRole("button", { name: "Run topics" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
