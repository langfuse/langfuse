import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type OrderByState } from "@langfuse/shared";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: {} }),
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

type Row = { scoreName: string; status: string };

const columns: LangfuseColumnDef<Row>[] = [
  {
    accessorKey: "scoreName",
    id: "scoreName",
    header: "Generated Score Name",
    enableSorting: true,
  },
  {
    accessorKey: "status",
    id: "status",
    header: "Status",
  },
];

const rows: Row[] = [
  { scoreName: "zeta-score", status: "ACTIVE" },
  { scoreName: "alpha-score", status: "ACTIVE" },
];

function SortableTable({ initialOrderBy }: { initialOrderBy: OrderByState }) {
  const [orderBy, setOrderBy] = useState<OrderByState>(initialOrderBy);

  return (
    <DataTable
      tableName="evalConfigsTest"
      columns={columns}
      orderBy={orderBy}
      setOrderBy={setOrderBy}
      hidePagination
      data={{
        isLoading: false,
        isError: false,
        data: rows,
      }}
    />
  );
}

describe("DataTable column sorting affordances", () => {
  it("does not show a sort indicator on a non-sortable column even if orderBy points at it", () => {
    render(
      <SortableTable initialOrderBy={{ column: "status", order: "ASC" }} />,
    );

    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.queryByText("sorted ascending")).not.toBeInTheDocument();
    expect(screen.queryByText("sorted descending")).not.toBeInTheDocument();
  });

  it("shows a sort indicator on a sortable column and toggles order on click", () => {
    render(
      <SortableTable initialOrderBy={{ column: "scoreName", order: "ASC" }} />,
    );

    const nameHeader = screen.getByText("Generated Score Name").closest("th");
    expect(nameHeader).toHaveTextContent("sorted ascending");

    fireEvent.click(nameHeader!);
    expect(nameHeader).not.toHaveTextContent("sorted ascending");
    expect(nameHeader).not.toHaveTextContent("sorted descending");

    fireEvent.click(nameHeader!);
    expect(nameHeader).toHaveTextContent("sorted descending");
  });

  it("does not change orderBy when a non-sortable header is clicked", () => {
    render(
      <SortableTable initialOrderBy={{ column: "scoreName", order: "ASC" }} />,
    );

    const nameHeader = screen.getByText("Generated Score Name").closest("th");
    const statusHeader = screen.getByText("Status").closest("th");

    fireEvent.click(statusHeader!);

    expect(nameHeader).toHaveTextContent("sorted ascending");
    expect(statusHeader).not.toHaveTextContent("sorted ascending");
    expect(statusHeader).not.toHaveTextContent("sorted descending");
  });
});

describe("DataTable custom row height", () => {
  // jsdom has no PointerEvent, so pointer helpers fall back to Event and
  // drop clientY. A MouseEvent under that name keeps the drag coordinates.
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(
      type: string,
      params: MouseEventInit & { pointerId?: number } = {},
    ) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }

  beforeAll(() => {
    Object.defineProperty(globalThis, "PointerEvent", {
      configurable: true,
      writable: true,
      value: PointerEventPolyfill,
    });
  });

  const pointAt = (handle: HTMLElement, type: string, clientY: number) => {
    handle.dispatchEvent(
      new PointerEventPolyfill(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
        clientY,
      }),
    );
  };

  const rect = (height: number): DOMRect =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: height,
      right: 100,
      width: 100,
      height,
      toJSON: () => ({}),
    }) as DOMRect;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderResizableTable(
    onCustomRowHeightChange: (heightPx: number) => void = vi.fn(),
    customRowHeightPx?: number,
  ) {
    render(
      <DataTable
        tableName="experiment-items"
        columns={columns}
        hidePagination
        rowHeight="m"
        customRowHeightPx={customRowHeightPx}
        onCustomRowHeightChange={onCustomRowHeightChange}
        data={{ isLoading: false, isError: false, data: rows }}
      />,
    );
  }

  it("centers a 6px hit area on the row border, 3px on each side", () => {
    renderResizableTable();

    const handles = [
      ...document.querySelectorAll<HTMLElement>("[data-row-resize-handle]"),
    ];
    const edge = (name: string) =>
      handles.filter((el) => el.dataset.rowResizeEdge === name);

    // Two columns. The first row owns the 3px above its border. The second
    // row owns the 3px below that border, and a 6px strip on its own bottom
    // edge because nothing follows it.
    expect(edge("above")).toHaveLength(2);
    expect(edge("below")).toHaveLength(2);
    expect(edge("last")).toHaveLength(2);
    for (const el of edge("above")) {
      expect(el).toHaveStyle({ height: "3px", bottom: "-1px" });
    }
    for (const el of edge("below")) {
      expect(el).toHaveStyle({ height: "3px", top: "0px" });
    }
    for (const el of edge("last")) {
      expect(el).toHaveStyle({ height: "6px", bottom: "-3px" });
      expect(el).toHaveAttribute("aria-hidden", "true");
    }
    expect(screen.getAllByRole("slider", { name: "Row height" })).toHaveLength(
      1,
    );
  });

  it("does not render a row resize handle for tables that only use presets", () => {
    render(
      <SortableTable initialOrderBy={{ column: "scoreName", order: "ASC" }} />,
    );

    expect(
      screen.queryByRole("slider", { name: "Row height" }),
    ).not.toBeInTheDocument();
  });

  it("applies one dragged height to every cell, including every column of the row", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(96),
    );
    const onCustomRowHeightChange = vi.fn();
    renderResizableTable(onCustomRowHeightChange);

    const handle = screen.getByRole("slider", { name: "Row height" });
    act(() => {
      pointAt(handle, "pointerdown", 100);
      pointAt(handle, "pointermove", 220);
    });

    const boxes = document.querySelectorAll("[data-row-height]");
    // Two rows, two columns: the drag is a table height, so run columns stay aligned.
    expect(boxes).toHaveLength(4);
    for (const box of boxes) {
      expect(box).toHaveStyle({ height: "216px" });
    }

    act(() => {
      pointAt(handle, "pointerup", 220);
    });
    expect(onCustomRowHeightChange).toHaveBeenCalledExactlyOnceWith(216);
  });

  it("shrinks a custom height back below Medium and returns string cells to one line", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(208),
    );
    const onCustomRowHeightChange = vi.fn();
    renderResizableTable(onCustomRowHeightChange, 208);

    expect(screen.getByText("zeta-score")).not.toHaveClass("truncate");

    const handle = screen.getByRole("slider", { name: "Row height" });
    act(() => {
      pointAt(handle, "pointerdown", 400);
      pointAt(handle, "pointermove", 240);
    });

    const boxes = document.querySelectorAll("[data-row-height]");
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box).toHaveStyle({ height: "48px", maxHeight: "48px" });
    }
    expect(screen.getByText("zeta-score")).toHaveClass("truncate");

    act(() => {
      pointAt(handle, "pointerup", 240);
    });
    expect(onCustomRowHeightChange).toHaveBeenCalledExactlyOnceWith(48);
  });

  it("leaves the preset in place when the row edge is pressed without moving", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(192),
    );
    const onCustomRowHeightChange = vi.fn();
    renderResizableTable(onCustomRowHeightChange);

    const handle = screen.getByRole("slider", { name: "Row height" });
    act(() => {
      pointAt(handle, "pointerdown", 40);
      pointAt(handle, "pointerup", 40);
    });

    expect(onCustomRowHeightChange).not.toHaveBeenCalled();
    expect(document.querySelector("[data-row-height]")).not.toHaveStyle({
      height: "192px",
    });
  });

  it("grows every cell together when the row-height slider is stepped down", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(96),
    );
    const onCustomRowHeightChange = vi.fn();
    renderResizableTable(onCustomRowHeightChange);

    const handle = screen.getByRole("slider", { name: "Row height" });
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("aria-valuenow", "96");
    act(() => {
      fireEvent.keyDown(handle, { key: "ArrowDown" });
      fireEvent.keyDown(handle, { key: "ArrowDown" });
    });

    expect(onCustomRowHeightChange).not.toHaveBeenCalled();
    expect(handle).toHaveAttribute("aria-valuenow", "128");
    for (const box of document.querySelectorAll("[data-row-height]")) {
      expect(box).toHaveStyle({ height: "128px" });
    }

    act(() => {
      fireEvent.keyUp(handle, { key: "ArrowDown" });
    });
    expect(onCustomRowHeightChange).toHaveBeenCalledExactlyOnceWith(128);
  });
});
