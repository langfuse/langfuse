import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTopicTraceSelector } from "./TopicTraceSelector";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/src/components/table/peek/hooks/usePeekNavigation", () => ({
  usePeekNavigation: () => ({
    openPeek: vi.fn(),
  }),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      previewTraces: {
        useQuery: (input: unknown, options: object) =>
          useQuery({
            queryKey: ["preview", input],
            queryFn: () => mocks.fetch(input),
            ...options,
          }),
      },
    },
  },
}));
vi.mock("@/src/features/events/hooks/useEventsFilterOptions", () => ({
  useEventsFilterOptions: () => ({
    filterOptions: {},
    isFilterOptionsPending: false,
  }),
}));
vi.mock("@/src/features/search-bar", () => ({
  TableSearchBar: () => <div>Query editor</div>,
  toObservedOptions: () => ({}),
  fieldRegistryFromColumns: () => ({ fields: [], columns: [] }),
}));
vi.mock(
  "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder",
  () => ({
    ObservationFilterBuilder: () => <div>Filter builder</div>,
  }),
);

function TraceSelector() {
  const { selection, controls } = useTopicTraceSelector({
    projectId: "project",
    onOpenTrace: vi.fn(),
    enabled: true,
    filterOptionsEnabled: true,
  });
  return (
    <>
      {controls}
      <output data-testid="selected">{JSON.stringify(selection)}</output>
    </>
  );
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TraceSelector />
    </QueryClientProvider>,
  );
  return { client };
}

function result(...ids: string[]) {
  return {
    matchedTraceCount: ids.length,
    selectedTraceCount: ids.length,
    traces: ids.map((id) => ({
      id,
      timestamp: new Date(),
      name: id,
      environment: "default",
    })),
  };
}

function selected() {
  return JSON.parse(screen.getByTestId("selected").textContent!);
}

beforeEach(() => {
  mocks.fetch.mockReset();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("Topics trace selection", () => {
  it("freezes only the latest preview and invalidates it immediately when criteria change", async () => {
    const pending: Array<(value: ReturnType<typeof result>) => void> = [];
    mocks.fetch.mockImplementation(
      () => new Promise((resolve) => pending.push(resolve)),
    );
    const { client } = setup();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(selected()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview traces" }));
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.click(screen.getByRole("checkbox", { name: "Sample traces" }));
    fireEvent.change(screen.getByLabelText("Maximum traces"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview traces" }));
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1](result("new-trace")));
    await waitFor(() =>
      expect(selected()).toMatchObject({
        count: 1,
        selection: { limit: 50, seed: mocks.fetch.mock.calls[1][0].seed },
      }),
    );
    await act(async () => pending[0](result("stale-trace")));
    expect(selected().selection.seed).toBe(mocks.fetch.mock.calls[1][0].seed);
    expect(screen.queryByRole("link", { name: "stale-trace" })).toBeNull();
    await act(async () => {
      await client.invalidateQueries();
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(selected().selection.seed).toBe(mocks.fetch.mock.calls[1][0].seed);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select trace new-trace" }),
    );
    expect(selected()).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all previewed traces" }),
    );
    expect(selected()).toMatchObject({
      count: 1,
      selection: { excludedTraceIds: [] },
    });
    fireEvent.change(screen.getByLabelText("Maximum traces"), {
      target: { value: "100" },
    });
    expect(selected()).toBeNull();
    fireEvent.change(screen.getByLabelText("Maximum traces"), {
      target: { value: "50" },
    });
    expect(selected()).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("preserves exclusions through pagination, then refreshes the cohort", async () => {
    const traces = Array.from({ length: 21 }, (_, i) => `trace-${i}`);
    mocks.fetch.mockResolvedValue(result(...traces));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Preview traces" }));
    await screen.findByRole("checkbox", { name: "Select trace trace-0" });
    expect(
      screen.queryByRole("checkbox", { name: "Select trace trace-20" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select trace trace-0" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select trace trace-20" }),
    );
    expect(selected()).toMatchObject({
      count: 19,
      selection: { excludedTraceIds: ["trace-0", "trace-20"] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh selection" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(selected()).toMatchObject({
        count: 21,
        selection: { excludedTraceIds: [] },
      }),
    );
    expect(mocks.fetch.mock.calls[0][0].seed).not.toBe(
      mocks.fetch.mock.calls[1][0].seed,
    );
    expect(mocks.fetch.mock.calls[0][0]).toMatchObject({
      limit: null,
      sampling: "random",
    });
  });
});
