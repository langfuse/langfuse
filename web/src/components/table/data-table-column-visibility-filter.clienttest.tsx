import { StrictMode, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { type VisibilityState } from "@tanstack/react-table";
import { DataTableColumnVisibilityFilter } from "./data-table-column-visibility-filter";
import {
  useColumnOrder,
  useColumnVisibility,
} from "@/src/features/column-visibility";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { type LangfuseColumnDef } from "./types";

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
  {
    accessorKey: "traceScores",
    header: "Trace Scores",
    enableHiding: true,
    columns: [
      { accessorKey: "score-a", header: "Score A", enableHiding: true },
    ],
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
        defaultHidden: true,
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

function DefaultSettingsHarness({
  initialColumnOrder = ["name", "traceItemScores"],
}: {
  initialColumnOrder?: string[];
}) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    name: true,
    "traceItemScores-accuracy": true,
    "traceItemScores-helpfulness": false,
    traceItemScores: false,
    removedColumn: false,
  });
  const [columnOrder, setColumnOrder] = useState(initialColumnOrder);
  const [showOutput, setShowOutput] = useState(true);

  return (
    <DataTableColumnVisibilityFilter
      columns={groupedColumns}
      columnVisibility={columnVisibility}
      setColumnVisibility={setColumnVisibility}
      columnOrder={columnOrder}
      setColumnOrder={setColumnOrder}
      additionalColumnSettings={{
        isDefault: showOutput,
        onRestoreDefaults: () => setShowOutput(true),
        content: (
          <button onClick={() => setShowOutput(!showOutput)}>
            Toggle output section
          </button>
        ),
      }}
    />
  );
}

// The picker as the app wires it: both pieces of column state come from local
// storage through their hooks, rather than from useState.
function StoredStateHarness({
  orderKey,
  visibilityKey,
}: {
  orderKey: string;
  visibilityKey: string;
}) {
  const [columnVisibility, setColumnVisibility] = useColumnVisibility<{
    id: string;
  }>(visibilityKey, groupedColumns);
  const [columnOrder, setColumnOrder] = useColumnOrder<{ id: string }>(
    orderKey,
    groupedColumns,
  );

  return (
    <DataTableColumnVisibilityFilter
      columns={groupedColumns}
      columnVisibility={columnVisibility}
      setColumnVisibility={setColumnVisibility}
      columnOrder={columnOrder}
      setColumnOrder={setColumnOrder}
      tableName="experiments"
      isV4={true}
    />
  );
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
    localStorage.clear();
    h.capture.mockClear();
    h.onColumnGroupToggle.mockClear();
  });

  it("toggles a hideable column when its label is clicked", () => {
    render(<ColumnVisibilityFilterHarness />, { wrapper: LayerProvider });

    fireEvent.click(screen.getByRole("button", { name: /columns/i }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const inputCheckbox = screen.getByRole("checkbox", { name: "Input" });
    expect(inputCheckbox).toBeChecked();

    fireEvent.click(screen.getByText("Input"));

    expect(screen.getByRole("checkbox", { name: "Input" })).not.toBeChecked();
  });

  it("captures column_visibility_changed once with tableName and isV4", () => {
    render(<ColumnVisibilityFilterHarness />, { wrapper: LayerProvider });

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
      { wrapper: LayerProvider },
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
    render(<GroupedColumnVisibilityHarness />, { wrapper: LayerProvider });

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

  it("restores grouped defaults and keeps the group expanded after reopening", () => {
    render(<GroupedColumnVisibilityHarness />, { wrapper: LayerProvider });

    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    fireEvent.click(screen.getByText("Trace Item Scores"));
    fireEvent.click(screen.getByRole("button", { name: "Restore Defaults" }));

    expect(screen.getByRole("checkbox", { name: "accuracy" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "helpfulness" }),
    ).not.toBeChecked();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    expect(screen.getByRole("checkbox", { name: "accuracy" })).toBeChecked();
  });

  it("shows reset only for changed leaf visibility and hides it after restoring defaults", () => {
    render(<DefaultSettingsHarness />, { wrapper: LayerProvider });
    fireEvent.click(screen.getByRole("button", { name: /^Columns/ }));
    expect(
      screen.queryByRole("button", { name: "Restore Defaults" }),
    ).toBeNull();

    fireEvent.click(screen.getByText("Name"));
    expect(
      screen.getByRole("button", { name: "Restore Defaults" }),
    ).toBeVisible();
    fireEvent.click(screen.getByText("Name"));
    expect(
      screen.queryByRole("button", { name: "Restore Defaults" }),
    ).toBeNull();

    fireEvent.click(screen.getByText("Trace Item Scores"));
    fireEvent.click(screen.getByRole("checkbox", { name: "helpfulness" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore Defaults" }));
    expect(
      screen.getByRole("checkbox", { name: "helpfulness" }),
    ).not.toBeChecked();
    expect(
      screen.queryByRole("button", { name: "Restore Defaults" }),
    ).toBeNull();
  });

  it("offers reset when only the column order differs", () => {
    render(
      <DefaultSettingsHarness
        initialColumnOrder={["traceItemScores", "name"]}
      />,
      { wrapper: LayerProvider },
    );
    fireEvent.click(screen.getByRole("button", { name: /^Columns/ }));
    fireEvent.click(screen.getByRole("button", { name: "Restore Defaults" }));
    expect(
      screen.queryByRole("button", { name: "Restore Defaults" }),
    ).toBeNull();
  });

  // A visibility map under the order key — what a local storage key shared
  // between the two hooks left behind — reached `columnIdsOrder.map` and threw
  // "map is not a function" as the popover rendered.
  it("renders with a stored column order that is not an array", () => {
    localStorage.setItem("storedOrder", JSON.stringify({ name: true }));

    render(
      <StoredStateHarness
        orderKey="storedOrder"
        visibilityKey="storedVisibility"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Columns/ }));

    expect(screen.getByRole("checkbox", { name: "Name" })).toBeChecked();
    expect(screen.getByText("Trace Item Scores")).toBeVisible();
  });

  it("offers reset for comparison content settings even with default columns", () => {
    render(<DefaultSettingsHarness />, { wrapper: LayerProvider });
    fireEvent.click(screen.getByRole("button", { name: /^Columns/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Toggle output section" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Restore Defaults" }));
    expect(
      screen.queryByRole("button", { name: "Restore Defaults" }),
    ).toBeNull();
  });
});
