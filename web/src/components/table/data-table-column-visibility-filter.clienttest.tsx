import { StrictMode, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { type VisibilityState } from "@tanstack/react-table";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/data-table-column-visibility-filter";
import { LAYER_ORDER } from "@/src/components/ui/layer";
import { type LangfuseColumnDef } from "@/src/components/table/types";

const h = vi.hoisted(() => ({
  capture: vi.fn(),
  onColumnGroupToggle: vi.fn(),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => h.capture,
}));

const columns: LangfuseColumnDef<{ id: string }>[] = [
  {
    accessorKey: "startTime",
    header: "Start Time",
    enableHiding: false,
  },
  {
    accessorKey: "input",
    header: "Input",
    enableHiding: true,
  },
];

const groupedColumns: LangfuseColumnDef<{ id: string }>[] = [
  {
    accessorKey: "name",
    header: "Name",
    enableHiding: true,
  },
  {
    accessorKey: "traceItemScores",
    header: "Trace Item Scores",
    enableHiding: true,
    columns: [
      {
        accessorKey: "traceItemScores-accuracy",
        header: "accuracy",
        enableHiding: true,
      },
      {
        accessorKey: "traceItemScores-helpfulness",
        header: "helpfulness",
        enableHiding: true,
      },
    ],
  },
];

function ColumnVisibilityFilterHarness() {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    startTime: true,
    input: true,
  });

  return (
    <DataTableColumnVisibilityFilter
      columns={columns}
      columnVisibility={columnVisibility}
      setColumnVisibility={setColumnVisibility}
      tableName="experiments"
      isV4={true}
    />
  );
}

function GroupedColumnVisibilityHarness() {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    name: true,
    "traceItemScores-accuracy": false,
    "traceItemScores-helpfulness": false,
  });

  return (
    <DataTableColumnVisibilityFilter
      columns={groupedColumns}
      columnVisibility={columnVisibility}
      setColumnVisibility={setColumnVisibility}
      tableName="experiments"
      isV4={true}
      onColumnGroupToggle={h.onColumnGroupToggle}
    />
  );
}

function installOverlayLayers() {
  const overlayRoot = document.createElement("div");
  overlayRoot.setAttribute("data-overlay-root", "");
  for (const layer of LAYER_ORDER) {
    const layerNode = document.createElement("div");
    layerNode.setAttribute("data-layer", layer);
    overlayRoot.appendChild(layerNode);
  }
  document.body.appendChild(overlayRoot);
  return overlayRoot;
}

describe("DataTableColumnVisibilityFilter", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query.includes("min-width"),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) satisfies MediaQueryList,
    );
  });

  beforeEach(() => {
    h.capture.mockClear();
    h.onColumnGroupToggle.mockClear();
    installOverlayLayers();
  });

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
  });

  it("toggles a hideable column when its label is clicked", () => {
    render(<ColumnVisibilityFilterHarness />);

    fireEvent.click(screen.getByRole("button", { name: /columns/i }));

    const inputCheckbox = screen.getByRole("checkbox", { name: "Input" });
    expect(inputCheckbox).toBeChecked();

    fireEvent.click(screen.getByText("Input"));

    expect(screen.getByRole("checkbox", { name: "Input" })).not.toBeChecked();
  });

  it("captures column_visibility_changed once with tableName and isV4", () => {
    render(<ColumnVisibilityFilterHarness />);

    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    fireEvent.click(screen.getByText("Input"));

    expect(h.capture).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledWith("table:column_visibility_changed", {
      selectedColumns: ["startTime"],
      tableName: "experiments",
      isV4: true,
    });
  });

  // The capture used to sit inside the setColumnVisibility updater. An updater
  // has to be pure, and React re-invokes it under StrictMode — which the app
  // enables — so every toggle was counted twice. Rendering the harness in
  // StrictMode is what makes this a guard rather than a restatement of the
  // test above.
  it("counts one toggle once under StrictMode", () => {
    render(
      <StrictMode>
        <ColumnVisibilityFilterHarness />
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    fireEvent.click(screen.getByText("Input"));

    const events = h.capture.mock.calls.filter(
      ([name]) => name === "table:column_visibility_changed",
    );
    expect(events).toHaveLength(1);
    expect(events[0][1].selectedColumns).not.toContain("input");
  });

  it("notifies onColumnGroupToggle with the group id, not score names", () => {
    render(<GroupedColumnVisibilityHarness />);

    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    fireEvent.click(screen.getByRole("button", { name: "Select All" }));

    expect(h.onColumnGroupToggle).toHaveBeenCalledTimes(1);
    expect(h.onColumnGroupToggle).toHaveBeenCalledWith({
      groupId: "traceItemScores",
      enabledCount: 2,
      totalCount: 2,
    });
    expect(JSON.stringify(h.onColumnGroupToggle.mock.calls[0][0])).not.toMatch(
      /helpfulness|accuracy/,
    );
  });
});
