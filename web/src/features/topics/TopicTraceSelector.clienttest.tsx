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

function TraceSelector({ onOpenTrace }: { onOpenTrace: () => void }) {
  const { selection, controls } = useTopicTraceSelector({
    projectId: "project",
    onOpenTrace,
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
  const onOpenTrace = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TraceSelector onOpenTrace={onOpenTrace} />
    </QueryClientProvider>,
  );
  return { client, onOpenTrace };
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

const scrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.push.mockReset();
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
  vi.useRealTimers();
});

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

  it("preserves exclusions through peek navigation and pagination, then refreshes the cohort", async () => {
    const traces = Array.from({ length: 21 }, (_, i) => `trace-${i}`);
    mocks.fetch.mockResolvedValue(result(...traces));
    const { onOpenTrace } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Preview traces" }));
    await screen.findByRole("checkbox", { name: "Select trace trace-0" });
    expect(
      screen.queryByRole("checkbox", { name: "Select trace trace-20" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select trace trace-0" }),
    );
    expect(mocks.push).not.toHaveBeenCalled();
    expect(onOpenTrace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "trace-0" }));
    fireEvent.click(screen.getByRole("row", { name: /Select trace trace-1 / }));
    expect(mocks.push.mock.calls).toEqual(
      ["trace-0", "trace-1"].map((traceId) => [
        { pathname: "/project/project/topics", query: { peek: traceId } },
        undefined,
        { shallow: true },
      ]),
    );
    expect(onOpenTrace).toHaveBeenCalledTimes(2);
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

  it.each([
    { hour: 0, endDate: "2026-09-30", endDay: 1 },
    { hour: 14, endDate: "2026-10-01", endDay: 2 },
  ])(
    "preserves an exclusive boundary at $hour:00 when switching to custom dates",
    async ({ hour, endDate, endDay }) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 9, 1, hour));
      mocks.fetch.mockResolvedValue(result("trace-a"));
      setup();
      fireEvent.keyDown(screen.getByLabelText("Trace time range"), {
        key: "ArrowDown",
      });
      fireEvent.keyDown(
        await screen.findByRole("option", { name: "Custom range" }),
        { key: "Enter" },
      );
      const from = (
        screen.getByLabelText("Trace start date") as HTMLInputElement
      ).value;
      expect(from).toBe("2026-09-24");
      expect(screen.getByLabelText("Trace end date")).toHaveValue(endDate);
      fireEvent.click(screen.getByRole("button", { name: "Preview traces" }));
      await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
      expect(mocks.fetch.mock.calls[0][0]).toMatchObject({
        from: new Date(`${from}T00:00:00`),
        to: new Date(2026, 9, endDay),
      });
      fireEvent.change(screen.getByLabelText("Trace end date"), {
        target: { value: from },
      });
      fireEvent.click(screen.getByRole("button", { name: "Preview traces" }));
      await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
      const singleDayEnd = new Date(`${from}T00:00:00`);
      singleDayEnd.setDate(singleDayEnd.getDate() + 1);
      expect(mocks.fetch.mock.calls[1][0].to).toEqual(singleDayEnd);
    },
  );
});
