import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TopicFacet, TopicRule } from "@langfuse/shared/topics";
import { TopicPipelineForm } from "./TopicPipelineForm";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  trigger: vi.fn(),
  saveRule: vi.fn(),
  onTriggered: vi.fn(),
}));
const rule = {
  id: "rule",
  projectId: "project",
  name: "Production intents",
  filter: [
    {
      column: "environment",
      type: "stringOptions",
      operator: "any of",
      value: ["production"],
    },
  ],
  sampling: "latest",
  limit: 50,
  facetIds: ["intent"],
  updatedAt: "2026-09-16T00:00:00Z",
} satisfies TopicRule;
vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      previewTraces: {
        useQuery: (input: unknown, options: object) =>
          useQuery({
            queryKey: ["preview", input],
            queryFn: () => mocks.preview(input),
            ...options,
          }),
      },
      summaryCounts: {
        useQuery: () => ({
          data: [{ facetId: "intent", facetVersion: 2, count: 120 }],
        }),
      },
      rules: { useQuery: () => ({ data: [rule] }) },
      saveRule: {
        useMutation: () => ({
          mutate: mocks.saveRule,
          isPending: false,
          reset: vi.fn(),
        }),
      },
      trigger: {
        useMutation: () => ({ mutateAsync: mocks.trigger, isPending: false }),
      },
    },
    useUtils: () => ({ topics: { summaryCounts: { invalidate: vi.fn() } } }),
  },
}));
vi.mock("@/src/components/table/peek/hooks/usePeekNavigation", () => ({
  usePeekNavigation: () => ({ openPeek: vi.fn() }),
}));
vi.mock("@/src/features/events/hooks/useEventsFilterOptions", () => ({
  useEventsFilterOptions: () => ({
    filterOptions: {},
    isFilterOptionsPending: false,
  }),
}));
vi.mock("@/src/features/search-bar", () => ({
  TableSearchBar: () => null,
  toObservedOptions: () => ({}),
  fieldRegistryFromColumns: () => ({ fields: [] }),
}));
vi.mock(
  "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder",
  () => ({ ObservationFilterBuilder: () => null }),
);

const facets: TopicFacet[] = ["Intent", "Issues"].map((name) => ({
  id: name.toLowerCase(),
  projectId: "project",
  name,
  description: "",
  versions: [2, 1].map((version) => ({
    projectId: "project",
    facetId: name.toLowerCase(),
    version,
    prompt: `Describe ${name}`,
    createdAt: "2026-09-16T00:00:00Z",
  })),
}));
const latestFacets = facets.map((facet) => ({ facetId: facet.id, version: 2 }));
function setup() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <TopicPipelineForm
        projectId="project"
        facets={facets}
        canWrite
        onTriggered={mocks.onTriggered}
        facetEditor={null}
        render={(actions, configuration) => (
          <>
            {actions}
            {configuration}
          </>
        )}
      />
    </QueryClientProvider>,
  );
}
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));
const processButton = () =>
  screen.getByRole("button", { name: /^Process (?:[\d,]+ )?traces$/ });
async function choose(label: string, option: string) {
  fireEvent.keyDown(screen.getByLabelText(label), { key: "ArrowDown" });
  fireEvent.keyDown(await screen.findByRole("option", { name: option }), {
    key: "Enter",
  });
}
async function submit(name: string | RegExp) {
  const count = mocks.trigger.mock.calls.length;
  click(name);
  await waitFor(() =>
    expect(mocks.onTriggered).toHaveBeenCalledTimes(count + 1),
  );
  return mocks.trigger.mock.calls.at(-1)![0];
}
async function preview() {
  click("Preview traces");
  await screen.findByRole("checkbox", { name: "Select trace trace-a" });
}

const scrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.trigger.mockResolvedValue({ id: "execution" });
  mocks.preview.mockResolvedValue({
    matchedTraceCount: 2,
    selectedTraceCount: 2,
    traces: ["trace-a", "trace-b"].map((id) => ({
      id,
      name: id,
      timestamp: new Date(),
      environment: "production",
    })),
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  vi.unstubAllGlobals();
});

it("processes pasted IDs and reviewed rule selections, invalidating edited criteria until reviewed again", async () => {
  setup();
  expect(processButton()).toBeDisabled();
  click("Configure topics");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Paste IDs" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.change(screen.getByLabelText("Trace IDs or links"), {
    target: {
      value: "trace-with/custom-id\nsecond-trace\ntrace-with/custom-id",
    },
  });
  await choose("Embedding dimensions", "512");
  click("Done");
  expect(await submit(/^Process 2 traces$/)).toEqual({
    projectId: "project",
    requestId: expect.any(String),
    operation: "process",
    traceIds: ["trace-with/custom-id", "second-trace"],
    facets: latestFacets,
    embeddingConfig: {
      embeddingModel: "cohere.embed-v4:0",
      embeddingDimensions: 512,
    },
    reuseExistingSummaries: false,
  });
  expect(mocks.preview).not.toHaveBeenCalled();

  click("Configure topics");
  await choose("Version for Intent", "v1");
  expect(screen.getByLabelText("Version for Intent")).toHaveTextContent("v1");
  await choose("Saved configuration", rule.name);
  expect(screen.getByLabelText("Version for Intent")).toHaveTextContent("v2");
  expect(screen.getByRole("checkbox", { name: "Issues" })).not.toBeChecked();
  expect(screen.getByLabelText("Maximum traces")).toHaveValue(50);
  await preview();
  const request = mocks.preview.mock.calls[0][0];
  expect(request).toMatchObject({
    filter: rule.filter,
    limit: 50,
    sampling: "latest",
    from: expect.any(Date),
    to: expect.any(Date),
    seed: expect.any(String),
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select trace trace-b" }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Reuse stored summaries" }),
  );
  fireEvent.click(screen.getByRole("link", { name: "trace-a" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  const selection = {
    filter: rule.filter,
    from: request.from,
    to: request.to,
    limit: 50,
    sampling: "latest",
    seed: request.seed,
    excludedTraceIds: ["trace-b"],
  };
  expect(await submit(/^Process 1 traces$/)).toEqual({
    projectId: "project",
    requestId: expect.any(String),
    operation: "process",
    selection,
    ruleId: rule.id,
    facets: [{ facetId: "intent", version: 2 }],
    embeddingConfig: {
      embeddingModel: "cohere.embed-v4:0",
      embeddingDimensions: 512,
    },
    reuseExistingSummaries: true,
  });

  click("Configure topics");
  fireEvent.change(screen.getByLabelText("Maximum traces"), {
    target: { value: "25" },
  });
  click("Done");
  expect(processButton()).toBeDisabled();
  click("Configure topics");
  await preview();
  click("Done");
  const changed = await submit(/^Process 2 traces$/);
  expect(changed.selection).toMatchObject({ limit: 25, excludedTraceIds: [] });
  expect(changed).not.toHaveProperty("ruleId");
  expect(mocks.saveRule).not.toHaveBeenCalled();
  click("Configure topics");
  click("Update rule");
  expect(mocks.saveRule).toHaveBeenCalledExactlyOnceWith({
    id: rule.id,
    projectId: rule.projectId,
    name: rule.name,
    filter: rule.filter,
    sampling: rule.sampling,
    facetIds: rule.facetIds,
    limit: 25,
  });
});

it("updates topics from stored summaries without a trace selection or process-only options", async () => {
  setup();
  click("Configure topics");
  await choose("Saved configuration", rule.name);
  await choose("Saved configuration", "Custom configuration");
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Reuse stored summaries" }),
  );
  await choose("Pipeline operation", "Update topics");
  await choose("Embedding dimensions", "256");
  fireEvent.change(screen.getByLabelText("Minimum traces for clustering"), {
    target: { value: "30" },
  });
  click("Done");
  expect(await submit("Update topics")).toEqual({
    projectId: "project",
    requestId: expect.any(String),
    operation: "update",
    facets: latestFacets,
    embeddingConfig: {
      embeddingModel: "cohere.embed-v4:0",
      embeddingDimensions: 256,
    },
    minimumTraceCount: 30,
    exploratory: false,
  });
  expect(mocks.preview).not.toHaveBeenCalled();
});
