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
import { TopicTraceSelector } from "./TopicTraceSelector";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), push: vi.fn() }));
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    pathname: "/project/[projectId]/topics",
    push: mocks.push,
  }),
}));
vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));
vi.mock("@/src/utils/api", () => ({
  getPathnameWithoutBasePath: () => "/project/project/topics",
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
  fieldRegistryFromColumns: () => ({ fields: [] }),
}));
vi.mock(
  "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder",
  () => ({
    ObservationFilterBuilder: () => <div>Filter builder</div>,
  }),
);

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <TopicTraceSelector projectId="project">
        {(ids) => (
          <>
            <button disabled={!ids}>Trigger topics</button>
            <output data-testid="selected">{JSON.stringify(ids)}</output>
          </>
        )}
      </TopicTraceSelector>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

function result(...ids: string[]) {
  return {
    matchedTraceCount: ids.length,
    selectedTraceCount: ids.length,
    sampledAt: new Date(),
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

const scrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.push.mockReset();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
});

describe("Topics trace selection", () => {
  it("opens trace peek from preview rows and names without changing the cohort", async () => {
    mocks.fetch.mockResolvedValue(result("trace-a", "trace-b"));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Preview traces" }));
    const checkbox = await screen.findByRole("checkbox", {
      name: "Select trace trace-a",
    });
    fireEvent.click(checkbox);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(selected()).toMatchObject({
      count: 1,
      selection: { excludedTraceIds: ["trace-a"] },
    });
    fireEvent.click(screen.getByRole("button", { name: "trace-a" }));
    expect(mocks.push).toHaveBeenLastCalledWith(
      { pathname: "/project/project/topics", query: { peek: "trace-a" } },
      undefined,
      { shallow: true },
    );
    fireEvent.click(screen.getByRole("row", { name: /Select trace trace-b/ }));
    expect(mocks.push).toHaveBeenLastCalledWith(
      { pathname: "/project/project/topics", query: { peek: "trace-b" } },
      undefined,
      { shallow: true },
    );
    expect(mocks.push).toHaveBeenCalledTimes(2);
    expect(selected()).toMatchObject({
      count: 1,
      selection: { excludedTraceIds: ["trace-a"] },
    });
  });

  it("freezes only the latest preview and invalidates it immediately when criteria change", async () => {
    const pending: Array<(value: ReturnType<typeof result>) => void> = [];
    mocks.fetch.mockImplementation(
      () => new Promise((resolve) => pending.push(resolve)),
    );
    const { client } = setup();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Trigger topics" }),
    ).toBeDisabled();
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
    expect(screen.queryByRole("button", { name: "stale-trace" })).toBeNull();
    await act(async () => {
      await client.invalidateQueries();
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(selected().selection.seed).toBe(mocks.fetch.mock.calls[1][0].seed);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select trace new-trace" }),
    );
    expect(
      screen.getByRole("button", { name: "Trigger topics" }),
    ).toBeDisabled();
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
    expect(
      screen.getByRole("button", { name: "Trigger topics" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Maximum traces"), {
      target: { value: "50" },
    });
    expect(
      screen.getByRole("button", { name: "Trigger topics" }),
    ).toBeDisabled();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("retains exclusions across preview pages and refreshes with a new sample seed", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Next traces" }));
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

  it("selects every matching trace by default and accepts more than 1,000 pasted IDs", async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `trace-${i}`);
    mocks.fetch.mockResolvedValue({
      ...result(...ids.slice(0, 100)),
      matchedTraceCount: ids.length,
      selectedTraceCount: ids.length,
    });
    setup();
    expect(screen.queryByLabelText("Maximum traces")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview traces" }));
    await waitFor(() =>
      expect(selected()).toMatchObject({
        count: 1001,
        selection: { limit: null },
      }),
    );
    expect(mocks.fetch.mock.calls[0][0].limit).toBeNull();
    expect(
      screen.getAllByRole("checkbox", { name: /^Select trace / }),
    ).toHaveLength(20);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Paste IDs" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.change(screen.getByLabelText("Trace IDs or links"), {
      target: { value: [...ids, ids[0]].join("\n") },
    });
    expect(selected()).toEqual({ count: 1001, traceIds: ids });
    expect(
      screen.getByRole("button", { name: "Trigger topics" }),
    ).not.toBeDisabled();
  });

  it("previews all of the displayed custom dates using an exclusive next-day boundary", async () => {
    mocks.fetch.mockResolvedValue(result("trace-a"));
    setup();
    fireEvent.keyDown(screen.getByLabelText("Trace time range"), {
      key: "ArrowDown",
    });
    fireEvent.keyDown(
      await screen.findByRole("option", { name: "Custom range" }),
      { key: "Enter" },
    );
    const from = (screen.getByLabelText("Trace start date") as HTMLInputElement)
      .value;
    const to = (screen.getByLabelText("Trace end date") as HTMLInputElement)
      .value;
    fireEvent.click(screen.getByRole("button", { name: "Preview traces" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    const expectedEnd = new Date(`${to}T00:00:00`);
    expectedEnd.setDate(expectedEnd.getDate() + 1);
    expect(mocks.fetch.mock.calls[0][0]).toMatchObject({
      from: new Date(`${from}T00:00:00`),
      to: expectedEnd,
    });
    fireEvent.change(screen.getByLabelText("Trace end date"), {
      target: { value: from },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview traces" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    const singleDayEnd = new Date(`${from}T00:00:00`);
    singleDayEnd.setDate(singleDayEnd.getDate() + 1);
    expect(mocks.fetch.mock.calls[1][0].to).toEqual(singleDayEnd);
  });
});
