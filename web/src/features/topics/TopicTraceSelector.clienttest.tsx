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

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
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
    sampledAt: new Date(),
    traces: ids.map((id) => ({
      id,
      timestamp: new Date(),
      name: id,
      environment: "default",
    })),
  };
}

const scrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeEach(() => {
  mocks.fetch.mockReset();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
});

describe("Topics trace selection", () => {
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
    fireEvent.change(screen.getByLabelText("Maximum traces"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview traces" }));
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1](result("new-trace")));
    await waitFor(() =>
      expect(screen.getByTestId("selected")).toHaveTextContent('["new-trace"]'),
    );
    await act(async () => pending[0](result("stale-trace")));
    expect(screen.getByTestId("selected")).toHaveTextContent('["new-trace"]');
    expect(screen.queryByRole("link", { name: "stale-trace" })).toBeNull();
    await act(async () => {
      await client.invalidateQueries();
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("selected")).toHaveTextContent('["new-trace"]');
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select trace new-trace" }),
    );
    expect(
      screen.getByRole("button", { name: "Trigger topics" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all sampled traces" }),
    );
    expect(screen.getByTestId("selected")).toHaveTextContent('["new-trace"]');
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
    expect(JSON.parse(screen.getByTestId("selected").textContent!)).toEqual(
      traces.slice(1, 20),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh sample" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("selected").textContent!)).toEqual(
        traces,
      ),
    );
    expect(mocks.fetch.mock.calls[0][0].seed).not.toBe(
      mocks.fetch.mock.calls[1][0].seed,
    );
    expect(mocks.fetch.mock.calls[0][0]).toMatchObject({
      limit: 100,
      sampling: "random",
    });
  });

  it("enforces the trace cap for filter sampling and pasted IDs", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Maximum traces"), {
      target: { value: "1001" },
    });
    expect(
      screen.getByRole("button", { name: "Preview traces" }),
    ).toBeDisabled();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Paste IDs" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.change(screen.getByLabelText("Trace IDs or links"), {
      target: { value: "trace-a\ntrace-a\ntrace-b" },
    });
    expect(screen.getByTestId("selected")).toHaveTextContent(
      '["trace-a","trace-b"]',
    );
    fireEvent.change(screen.getByLabelText("Trace IDs or links"), {
      target: {
        value: Array.from({ length: 1001 }, (_, i) => `trace-${i}`).join("\n"),
      },
    });
    expect(
      screen.getByRole("button", { name: "Trigger topics" }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "between 1 and 1000 unique traces",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
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
