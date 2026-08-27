import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { type VisibilityState } from "@tanstack/react-table";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/data-table-column-visibility-filter";
import { LAYER_ORDER } from "@/src/components/ui/layer";
import { type LangfuseColumnDef } from "@/src/components/table/types";

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
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
      tableName="test-table"
      isV4={false}
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
});
