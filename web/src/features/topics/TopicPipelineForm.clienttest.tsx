import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TopicFacet } from "@langfuse/shared/topics";
import { TopicPipelineForm } from "./TopicPipelineForm";
import type {
  TopicTraceCriteria,
  TopicTraceSelection,
} from "./TopicTraceSelector";

const selection = vi.hoisted(() => ({
  value: null as TopicTraceSelection | null,
  criteria: null as TopicTraceCriteria | null,
  initialCriteria: undefined as TopicTraceCriteria | undefined,
}));
const trigger = vi.hoisted(() => vi.fn());
const saveRule = vi.hoisted(() => vi.fn());
const rule = {
  id: "rule",
  projectId: "project",
  name: "Production intents",
  filter: [],
  sampling: "latest" as const,
  limit: 50,
  facetIds: ["intent"],
};
vi.mock("./TopicTraceSelector", () => ({
  TopicTraceSelector: ({
    children,
    initialCriteria,
  }: {
    children: (
      value: TopicTraceSelection | null,
      criteria: TopicTraceCriteria | null,
      controls: ReactNode,
    ) => ReactNode;
    initialCriteria?: TopicTraceCriteria;
  }) => {
    selection.initialCriteria = initialCriteria;
    return children(selection.value, selection.criteria, null);
  },
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      currentResults: { useQuery: () => ({ data: [] }) },
      rules: { useQuery: () => ({ data: [rule] }) },
      saveRule: {
        useMutation: () => ({
          mutate: saveRule,
          isPending: false,
          reset: vi.fn(),
        }),
      },
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

const scrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
});

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
      facetEditor: null,
      render: (actions: ReactNode, configuration: ReactNode) => (
        <>
          {actions}
          {configuration}
        </>
      ),
    };
    selection.value = null;
    selection.criteria = null;
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
    fireEvent.click(screen.getByRole("button", { name: "Configure topics" }));
    fireEvent.change(screen.getByLabelText("Embedding dimensions"), {
      target: { value: "512" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Force refresh" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByLabelText("Embedding dimensions")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Configure topics" }));
    expect(screen.getByLabelText("Embedding dimensions")).toHaveValue(512);
    expect(
      screen.getByRole("checkbox", { name: "Force refresh" }),
    ).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Configure topics" }));
    expect(screen.getByText(/Run on 10,000 traces/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Configure topics" }));
    // Reusing filters selects stable facets; runtime settings do not detach the rule.
    fireEvent.keyDown(screen.getByLabelText("Topic rule"), {
      key: "ArrowDown",
    });
    fireEvent.keyDown(await screen.findByRole("option", { name: rule.name }), {
      key: "Enter",
    });
    expect(selection.initialCriteria).toEqual({
      filter: rule.filter,
      sampling: rule.sampling,
      limit: rule.limit,
    });
    expect(screen.getByRole("checkbox", { name: "Intent" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Issues" })).not.toBeChecked();
    selection.criteria = selection.initialCriteria!;
    selection.value = {
      count: 50,
      selection: {
        ...selection.criteria,
        from: new Date("2026-09-15T00:00:00Z"),
        to: new Date("2026-09-16T00:00:00Z"),
        seed: "rule-preview",
        excludedTraceIds: [],
      },
    };
    view.rerender(<TopicPipelineForm {...props} />);
    fireEvent.change(screen.getByLabelText("Embedding dimensions"), {
      target: { value: "256" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Run topics" }));
    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(3));
    expect(trigger.mock.calls[2][0]).toMatchObject({
      ruleId: rule.id,
      facetVersionIds: ["intent-v1"],
      embeddingConfig: { embeddingDimensions: 256 },
    });

    selection.criteria = { ...selection.criteria, limit: 25 };
    selection.value = {
      count: 25,
      selection: { ...selection.value.selection, limit: 25 },
    };
    view.rerender(<TopicPipelineForm {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Run topics" }));
    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(4));
    expect(trigger.mock.calls[3][0]).not.toHaveProperty("ruleId");
    expect(saveRule).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Configure topics" }));
    fireEvent.click(screen.getByRole("button", { name: "Update rule" }));
    expect(saveRule).toHaveBeenCalledWith({
      projectId: "project",
      id: rule.id,
      name: rule.name,
      ...selection.criteria,
      facetIds: ["intent"],
    });
    fireEvent.keyDown(screen.getByLabelText("Topic rule"), {
      key: "ArrowDown",
    });
    fireEvent.keyDown(
      await screen.findByRole("option", { name: "Ad hoc selection" }),
      { key: "Enter" },
    );
    expect(selection.initialCriteria).toBeUndefined();
    expect(screen.getByRole("checkbox", { name: "Intent" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Issues" })).toBeChecked();
  });
});
