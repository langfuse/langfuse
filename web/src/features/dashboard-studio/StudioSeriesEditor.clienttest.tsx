import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type StudioQuery } from "@langfuse/shared";
import { StudioSeriesEditor } from "./StudioSeriesEditor";

vi.mock("./StudioFilterEditor", () => ({ StudioFilterEditor: () => null }));

const query: StudioQuery = {
  id: "a",
  label: "Latency",
  view: "observations",
  metrics: [
    { id: "latency", measure: "latency", aggregation: "p95" },
    { id: "cost", measure: "totalCost", aggregation: "sum" },
  ],
  dimensions: [{ field: "providedModelName" }],
  filters: [],
  orderBy: [
    { field: "p95_latency", direction: "desc" },
    { field: "sum_totalCost", direction: "asc" },
    { field: "providedModelName", direction: "asc" },
    { field: "time_dimension", direction: "asc" },
  ],
};

function renderEditor(initialQuery = query) {
  const onChange = vi.fn();
  render(
    <StudioSeriesEditor
      query={initialQuery}
      isV4
      timeSeries
      projectId="project"
      dateRange={{ from: new Date(0), to: new Date(1) }}
      onChange={onChange}
      onRemove={undefined}
    />,
  );
  return onChange;
}

async function select(label: string, option: string) {
  fireEvent.keyDown(screen.getAllByRole("combobox", { name: label })[0]!, {
    key: "ArrowDown",
  });
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

afterEach(cleanup);

const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  vi.unstubAllGlobals();
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

describe("studio series sort scope", () => {
  it("chooses a breakdown before changing the query", async () => {
    const onChange = renderEditor({ ...query, dimensions: [] });
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Add breakdown" }), {
      key: "ArrowDown",
    });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("option", { name: /^Name$/ }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ dimensions: [{ field: "name" }] }),
    );
  });

  it("clears explicit sorting when changing the source", async () => {
    const onChange = renderEditor();
    await select("Query a source", "Numeric scores");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ view: "scores-numeric", orderBy: undefined }),
    );
  });

  it.each([
    { name: "measure", label: "Measure", option: "Total tokens" },
    { name: "aggregation", label: "Aggregation", option: "Avg" },
    { name: "metric removal", remove: "Remove metric" },
  ])("prunes stale metric sorting after $name edits", async (edit) => {
    const onChange = renderEditor();
    if (edit.remove)
      fireEvent.click(screen.getAllByRole("button", { name: edit.remove })[0]!);
    else await select(edit.label!, edit.option!);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: [
          { field: "sum_totalCost", direction: "asc" },
          { field: "providedModelName", direction: "asc" },
          { field: "time_dimension", direction: "asc" },
        ],
      }),
    );
  });

  it.each([
    { name: "field", option: "Name" },
    { name: "removal", remove: true },
  ])(
    "prunes stale breakdown sorting after $name edits while preserving metric sorts",
    async (edit) => {
      const onChange = renderEditor();
      if (edit.remove)
        fireEvent.click(
          screen.getByRole("button", { name: "Remove breakdown" }),
        );
      else await select("Breakdown field", edit.option!);
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          orderBy: [
            { field: "p95_latency", direction: "desc" },
            { field: "sum_totalCost", direction: "asc" },
            { field: "time_dimension", direction: "asc" },
          ],
        }),
      );
    },
  );
});
