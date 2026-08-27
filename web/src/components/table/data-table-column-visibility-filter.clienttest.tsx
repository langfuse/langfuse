import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { type VisibilityState } from "@tanstack/react-table";
import {
  DataTableColumnVisibilityFilter,
  type ColumnGroupToggleHandler,
} from "@/src/components/table/data-table-column-visibility-filter";
import { LAYER_ORDER } from "@/src/components/ui/layer";
import { type LangfuseColumnDef } from "@/src/components/table/types";

const capture = vi.fn();
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
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

function ColumnVisibilityFilterHarness({
  onColumnGroupToggle,
}: {
  onColumnGroupToggle?: ColumnGroupToggleHandler;
} = {}) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    startTime: true,
    input: true,
    "score-a": true,
  });

  return (
    <DataTableColumnVisibilityFilter
      columns={columns}
      columnVisibility={columnVisibility}
      setColumnVisibility={setColumnVisibility}
      tableName="test-table"
      isV4={false}
      onColumnGroupToggle={onColumnGroupToggle}
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
    capture.mockClear();
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

  // The capture used to sit inside the setState updater, which React invokes
  // twice under StrictMode — every toggle was counted twice (LFE-15720).
  it("reports one column_visibility_changed per toggle, with the table's identity", () => {
    render(<ColumnVisibilityFilterHarness />);
    fireEvent.click(screen.getByRole("button", { name: /columns/i }));

    fireEvent.click(screen.getByText("Input"));

    const events = capture.mock.calls.filter(
      ([name]) => name === "table:column_visibility_changed",
    );
    expect(events).toHaveLength(1);
    expect(events[0][1]).toMatchObject({
      tableName: "test-table",
      isV4: false,
    });
    expect(events[0][1].selectedColumns).not.toContain("input");
  });

  it("reports a whole group toggled once, with its counts", () => {
    const onColumnGroupToggle = vi.fn();
    render(
      <ColumnVisibilityFilterHarness
        onColumnGroupToggle={onColumnGroupToggle}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /columns/i }));

    fireEvent.click(screen.getByRole("button", { name: "Deselect All" }));

    expect(onColumnGroupToggle).toHaveBeenCalledTimes(1);
    expect(onColumnGroupToggle).toHaveBeenCalledWith({
      groupId: "traceScores",
      columnCount: 1,
      visibleCount: 1,
      willBeVisible: false,
    });
  });
});
