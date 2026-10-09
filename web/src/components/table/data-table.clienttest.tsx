import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { DataTable } from "@/src/components/table/data-table";
import {
  useRowHeightRendering,
  type RowHeight,
  type CustomHeights,
} from "@/src/components/table/data-table-row-height-switch";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type OrderByState } from "@langfuse/shared";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: {} }),
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

type Row = { scoreName: string; status: string; mode: number };

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
  { scoreName: "zeta-score", status: "ACTIVE", mode: 0 },
  { scoreName: "alpha-score", status: "ACTIVE", mode: 1 },
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

  const pointAt = (
    handle: HTMLElement,
    type: string,
    clientY: number,
    pointerId = 1,
  ) => {
    handle.dispatchEvent(
      new PointerEventPolyfill(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId,
        clientY,
      }),
    );
  };

  const rect = (height: number, top = 0): DOMRect =>
    ({
      x: 0,
      y: top,
      top,
      left: 0,
      bottom: top + height,
      right: 100,
      width: 100,
      height,
      toJSON: () => ({}),
    }) as DOMRect;

  const rowBoxes = (index: number) => [
    ...document.querySelectorAll<HTMLElement>(
      `tr[data-row-index="${index}"] [data-row-height]`,
    ),
  ];

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

  it("resizes the row above when the pointer starts on the lower half of its border", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(96),
    );
    renderResizableTable();

    const lowerHalf = document.querySelector<HTMLElement>(
      'tr[data-row-index="1"] [data-row-resize-edge="below"]',
    );
    expect(lowerHalf).not.toBeNull();
    act(() => {
      pointAt(lowerHalf!, "pointerdown", 100);
      pointAt(lowerHalf!, "pointermove", 180);
    });

    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "176px" });
    }
    for (const box of rowBoxes(1)) {
      expect(box).toHaveStyle({ height: "96px", maxHeight: "96px" });
    }
  });

  it("does not render a row resize handle for tables that only use presets", () => {
    render(
      <SortableTable initialOrderBy={{ column: "scoreName", order: "ASC" }} />,
    );

    expect(
      screen.queryByRole("slider", { name: "Row height" }),
    ).not.toBeInTheDocument();
  });

  it("previews the dragged row only, then commits one height for the table", () => {
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

    // Both columns of the dragged row follow the pointer. The other row waits.
    expect(rowBoxes(0)).toHaveLength(2);
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "216px" });
    }
    for (const box of rowBoxes(1)) {
      expect(box).toHaveStyle({ height: "96px", maxHeight: "96px" });
    }

    act(() => {
      pointAt(handle, "pointerup", 220);
    });
    expect(onCustomRowHeightChange).toHaveBeenCalledExactlyOnceWith(216);
  });

  it("shrinks a Small row back to Small in the same drag", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(28),
    );
    const onCustomRowHeightChange = vi.fn();
    const onSelectRowHeight = vi.fn();
    render(
      <DataTable
        tableName="traces"
        columns={columns}
        hidePagination
        rowHeight="s"
        onCustomRowHeightChange={onCustomRowHeightChange}
        onSelectRowHeight={onSelectRowHeight}
        data={{ isLoading: false, isError: false, data: rows }}
      />,
    );

    const handle = screen.getByRole("slider", { name: "Row height" });
    expect(handle).toHaveAttribute("aria-valuemin", "28");
    act(() => {
      pointAt(handle, "pointerdown", 100);
      pointAt(handle, "pointermove", 240);
    });
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "168px" });
    }
    for (const box of rowBoxes(1)) {
      expect(box).toHaveStyle({ height: "28px", maxHeight: "28px" });
    }

    act(() => {
      pointAt(handle, "pointermove", -40);
    });
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "28px", maxHeight: "28px" });
    }
    for (const box of rowBoxes(1)) {
      expect(box).toHaveStyle({ height: "28px", maxHeight: "28px" });
    }

    act(() => {
      pointAt(handle, "pointerup", -40);
    });
    expect(onCustomRowHeightChange).not.toHaveBeenCalled();
    expect(onSelectRowHeight).not.toHaveBeenCalled();
    for (const box of document.querySelectorAll("[data-row-height]")) {
      expect(box).toHaveClass("h-7");
    }
  });

  it("selects Small when a second drag shrinks a free height down to it", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(168),
    );
    const onCustomRowHeightChange = vi.fn();
    const onSelectRowHeight = vi.fn();
    render(
      <DataTable
        tableName="traces"
        columns={columns}
        hidePagination
        rowHeight="s"
        customRowHeightPx={168}
        onCustomRowHeightChange={onCustomRowHeightChange}
        onSelectRowHeight={onSelectRowHeight}
        data={{ isLoading: false, isError: false, data: rows }}
      />,
    );

    const handle = screen.getByRole("slider", { name: "Row height" });
    act(() => {
      pointAt(handle, "pointerdown", 400);
      pointAt(handle, "pointermove", 0);
    });
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "28px", maxHeight: "28px" });
    }
    for (const box of rowBoxes(1)) {
      expect(box).toHaveStyle({ height: "168px", maxHeight: "168px" });
    }

    act(() => {
      pointAt(handle, "pointerup", 0);
    });
    expect(onCustomRowHeightChange).not.toHaveBeenCalled();
    expect(onSelectRowHeight).toHaveBeenCalledExactlyOnceWith("s");
  });

  it("uses a taller Small preset as the floor instead of the default 28px", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(332),
    );
    const onCustomRowHeightChange = vi.fn();
    const onSelectRowHeight = vi.fn();
    render(
      <DataTable
        tableName="experiment-grid"
        columns={columns}
        hidePagination
        rowHeight="m"
        customRowHeightPx={332}
        customRowHeights={{ s: "h-48", m: "h-64", l: "h-96" }}
        onCustomRowHeightChange={onCustomRowHeightChange}
        onSelectRowHeight={onSelectRowHeight}
        data={{ isLoading: false, isError: false, data: rows }}
      />,
    );

    const handle = screen.getByRole("slider", { name: "Row height" });
    expect(handle).toHaveAttribute("aria-valuemin", "192");
    act(() => {
      pointAt(handle, "pointerdown", 500);
      pointAt(handle, "pointermove", 0);
    });
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "192px", maxHeight: "192px" });
    }
    for (const box of rowBoxes(1)) {
      expect(box).toHaveStyle({ height: "332px", maxHeight: "332px" });
    }

    act(() => {
      pointAt(handle, "pointerup", 0);
    });
    expect(onCustomRowHeightChange).not.toHaveBeenCalled();
    expect(onSelectRowHeight).toHaveBeenCalledExactlyOnceWith("s");
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

    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "48px", maxHeight: "48px" });
    }
    for (const box of rowBoxes(1)) {
      expect(box).toHaveStyle({ height: "208px", maxHeight: "208px" });
    }
    expect(screen.getByText("zeta-score")).toHaveClass("truncate");
    expect(screen.getByText("alpha-score")).not.toHaveClass("truncate");

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
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "128px" });
    }
    for (const box of rowBoxes(1)) {
      expect(box).toHaveStyle({ height: "96px", maxHeight: "96px" });
    }

    act(() => {
      fireEvent.keyUp(handle, { key: "ArrowDown" });
    });
    expect(onCustomRowHeightChange).toHaveBeenCalledExactlyOnceWith(128);
  });

  function ModeProbe() {
    const rendering = useRowHeightRendering();
    return (
      <span data-testid="row-mode">
        {rendering?.compact ? "compact" : "expanded"}
      </span>
    );
  }

  const modeColumns: LangfuseColumnDef<Row>[] = [
    ...columns,
    {
      accessorKey: "mode",
      id: "mode",
      header: "Mode",
      cell: () => <ModeProbe />,
    },
  ];

  it("keeps mounted cell renders and commit effects unchanged during pixel-only dragging", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(96),
    );
    const onRender = vi.fn();
    const onCommit = vi.fn();
    function MountedCell({ rowIndex }: { rowIndex: number }) {
      onRender(rowIndex);
      useEffect(() => {
        onCommit(rowIndex);
      });
      return <span>Cell {rowIndex}</span>;
    }
    const mountedColumns: LangfuseColumnDef<Row>[] = [
      {
        accessorKey: "mode",
        id: "mode",
        header: "Mounted cell",
        cell: ({ row }) => <MountedCell rowIndex={row.index} />,
      },
    ];
    render(
      <DataTable
        tableName="row-height-render-boundary"
        columns={mountedColumns}
        hidePagination
        rowHeight="m"
        onCustomRowHeightChange={vi.fn()}
        data={{ isLoading: false, isError: false, data: rows }}
      />,
    );
    onRender.mockClear();
    onCommit.mockClear();

    const handle = screen.getByRole("slider", { name: "Row height" });
    act(() => pointAt(handle, "pointerdown", 100));
    for (const clientY of [101, 108, 116, 124, 140]) {
      act(() => pointAt(handle, "pointermove", clientY));
    }

    expect({
      cellRenders: onRender.mock.calls.length,
      cellCommitEffects: onCommit.mock.calls.length,
    }).toEqual({ cellRenders: 0, cellCommitEffects: 0 });
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "136px" });
    }
    for (const box of rowBoxes(1)) {
      expect(box).toHaveStyle({ height: "96px" });
    }
  });

  it("updates only the dragged row's cells when crossing Medium in either direction", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(28),
    );
    const onRender = vi.fn();
    const onCommit = vi.fn();
    function MountedModeCell({ rowIndex }: { rowIndex: number }) {
      const rendering = useRowHeightRendering();
      onRender(rowIndex);
      useEffect(() => {
        onCommit(rowIndex);
      });
      return (
        <span data-testid={`mounted-row-mode-${rowIndex}`}>
          {rendering?.compact ? "compact" : "expanded"}
        </span>
      );
    }
    const mountedColumns: LangfuseColumnDef<Row>[] = [
      {
        accessorKey: "mode",
        id: "mode",
        header: "Mounted mode cell",
        cell: ({ row }) => <MountedModeCell rowIndex={row.index} />,
      },
    ];
    render(
      <DataTable
        tableName="row-height-mode-boundary"
        columns={mountedColumns}
        hidePagination
        rowHeight="s"
        onCustomRowHeightChange={vi.fn()}
        data={{ isLoading: false, isError: false, data: rows }}
      />,
    );
    const handle = screen.getByRole("slider", { name: "Row height" });
    act(() => pointAt(handle, "pointerdown", 0));

    for (const [clientY, mode] of [
      [68, "expanded"],
      [67, "compact"],
    ] as const) {
      onRender.mockClear();
      onCommit.mockClear();
      act(() => pointAt(handle, "pointermove", clientY));

      expect(screen.getByTestId("mounted-row-mode-0")).toHaveTextContent(mode);
      expect(screen.getByTestId("mounted-row-mode-1")).toHaveTextContent(
        "compact",
      );
      expect(onRender.mock.calls).toEqual([[0]]);
      expect(onCommit.mock.calls).toEqual([[0]]);

      onRender.mockClear();
      onCommit.mockClear();
      act(() => pointAt(handle, "pointermove", clientY));
      expect(onRender).not.toHaveBeenCalled();
      expect(onCommit).not.toHaveBeenCalled();
    }
  });

  it("continues dragging when async values refresh without replacing rows or cells", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(28),
    );
    const onCustomRowHeightChange = vi.fn();
    const tableProps = {
      tableName: "row-height-async-values",
      columns: modeColumns,
      hidePagination: true,
      rowHeight: "s" as const,
      onCustomRowHeightChange,
    };
    const { rerender } = render(
      <DataTable
        {...tableProps}
        data={{ isLoading: false, isError: false, data: rows }}
      />,
    );
    const handle = screen.getByRole("slider", { name: "Row height" });
    const initialFrames = rowBoxes(0);
    act(() => {
      pointAt(handle, "pointerdown", 0);
      pointAt(handle, "pointermove", 100);
    });
    const refreshedRows = rows.map((row) => ({
      ...row,
      scoreName: `${row.scoreName}-loaded`,
    }));

    rerender(
      <DataTable
        {...tableProps}
        data={{ isLoading: false, isError: false, data: refreshedRows }}
      />,
    );

    expect(screen.getByText("zeta-score-loaded")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Row height" })).toBe(handle);
    const refreshedFrames = rowBoxes(0);
    expect(refreshedFrames).toHaveLength(initialFrames.length);
    refreshedFrames.forEach((frame, index) => {
      expect(frame).toBe(initialFrames[index]);
      expect(frame).toHaveStyle({ height: "128px" });
    });
    expect(screen.getAllByTestId("row-mode")[0]).toHaveTextContent("expanded");

    act(() => pointAt(handle, "pointermove", 160));
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "188px" });
    }
    act(() => pointAt(handle, "pointerup", 160));
    expect(onCustomRowHeightChange).toHaveBeenCalledExactlyOnceWith(188);
  });

  it("cancels a preview when refreshed data replaces the dragged row", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(28),
    );
    type IdentifiedRow = { id: string; mode: number };
    const identifiedColumns: LangfuseColumnDef<IdentifiedRow>[] = [
      {
        accessorKey: "mode",
        id: "mode",
        header: "Mode",
        cell: () => <ModeProbe />,
      },
    ];
    const onCustomRowHeightChange = vi.fn();
    const tableProps = {
      tableName: "row-height-refreshed-data",
      columns: identifiedColumns,
      hidePagination: true,
      rowHeight: "s" as const,
      onCustomRowHeightChange,
    };
    const { rerender } = render(
      <DataTable
        {...tableProps}
        data={{
          isLoading: false,
          isError: false,
          data: [{ id: "old", mode: 0 }],
        }}
      />,
    );
    const handle = screen.getByRole("slider", { name: "Row height" });
    act(() => {
      pointAt(handle, "pointerdown", 0);
      pointAt(handle, "pointermove", 100);
    });
    expect(screen.getByTestId("row-mode")).toHaveTextContent("expanded");

    rerender(
      <DataTable
        {...tableProps}
        data={{
          isLoading: false,
          isError: false,
          data: [{ id: "new", mode: 1 }],
        }}
      />,
    );

    expect(screen.getByTestId("row-mode")).toHaveTextContent("compact");
    const replacementHandle = screen.getByRole("slider", {
      name: "Row height",
    });
    act(() => {
      pointAt(replacementHandle, "pointermove", 120);
      pointAt(replacementHandle, "pointerup", 120);
    });
    expect(onCustomRowHeightChange).not.toHaveBeenCalled();
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "28px" });
    }
  });

  it("cancels a preview when visible column membership changes", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(28),
    );
    const onCustomRowHeightChange = vi.fn();
    const tableProps = {
      tableName: "row-height-visible-columns",
      columns: modeColumns,
      hidePagination: true,
      rowHeight: "s" as const,
      onCustomRowHeightChange,
      data: { isLoading: false, isError: false, data: rows },
    };
    const { rerender } = render(
      <DataTable {...tableProps} columnVisibility={{ status: false }} />,
    );
    const handle = screen.getByRole("slider", { name: "Row height" });
    act(() => {
      pointAt(handle, "pointerdown", 0);
      pointAt(handle, "pointermove", 100);
    });
    expect(screen.getAllByTestId("row-mode")[0]).toHaveTextContent("expanded");

    rerender(<DataTable {...tableProps} columnVisibility={{ status: true }} />);

    expect(screen.getAllByTestId("row-mode")[0]).toHaveTextContent("compact");
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "28px" });
    }
    const currentHandle = screen.getByRole("slider", { name: "Row height" });
    act(() => pointAt(currentHandle, "pointerup", 100));
    expect(onCustomRowHeightChange).not.toHaveBeenCalled();
  });

  it.each(["pointercancel", "lostpointercapture"])(
    "rolls back a preview without persisting on %s",
    (eventType) => {
      vi.spyOn(
        HTMLElement.prototype,
        "getBoundingClientRect",
      ).mockImplementation(() => rect(28));
      const onCustomRowHeightChange = vi.fn();
      render(
        <DataTable
          tableName="row-height-canceled-drag"
          columns={modeColumns}
          hidePagination
          rowHeight="s"
          onCustomRowHeightChange={onCustomRowHeightChange}
          data={{ isLoading: false, isError: false, data: rows }}
        />,
      );
      const handle = screen.getByRole("slider", { name: "Row height" });
      act(() => {
        pointAt(handle, "pointerdown", 0);
        pointAt(handle, "pointermove", 100);
      });
      expect(screen.getAllByTestId("row-mode")[0]).toHaveTextContent(
        "expanded",
      );

      act(() => pointAt(handle, eventType, 100));

      expect(onCustomRowHeightChange).not.toHaveBeenCalled();
      expect(screen.getAllByTestId("row-mode")[0]).toHaveTextContent("compact");
      expect(handle).toHaveAttribute("aria-valuenow", "28");
      for (const box of rowBoxes(0)) {
        expect(box).toHaveStyle({ height: "28px" });
      }
      act(() => pointAt(handle, "pointerup", 100));
      expect(onCustomRowHeightChange).not.toHaveBeenCalled();
    },
  );

  it("keeps the first pointer's resize active when a second pointer presses another row", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(28),
    );
    const onCustomRowHeightChange = vi.fn();
    render(
      <DataTable
        tableName="row-height-overlapping-pointers"
        columns={modeColumns}
        hidePagination
        rowHeight="s"
        onCustomRowHeightChange={onCustomRowHeightChange}
        data={{ isLoading: false, isError: false, data: rows }}
      />,
    );
    const firstHandle = screen.getByRole("slider", { name: "Row height" });
    const secondHandle = document.querySelector<HTMLElement>(
      'tr[data-row-index="1"] [data-row-resize-edge="last"]',
    );
    act(() => {
      pointAt(firstHandle, "pointerdown", 0, 1);
      pointAt(firstHandle, "pointermove", 100, 1);
      pointAt(secondHandle!, "pointerdown", 0, 2);
      pointAt(secondHandle!, "pointermove", 200, 2);
      pointAt(secondHandle!, "pointerup", 200, 2);
    });

    expect(onCustomRowHeightChange).not.toHaveBeenCalled();
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "128px" });
    }
    for (const box of rowBoxes(1)) {
      expect(box).toHaveStyle({ height: "28px" });
    }
    act(() => pointAt(firstHandle, "pointerup", 160, 1));
    expect(onCustomRowHeightChange).toHaveBeenCalledExactlyOnceWith(188);
    for (const box of [...rowBoxes(0), ...rowBoxes(1)]) {
      expect(box).toHaveStyle({ height: "28px" });
    }
  });

  it("switches the cell mode at Medium while the drag is still in progress", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(28),
    );
    const onCustomRowHeightChange = vi.fn();
    render(
      <DataTable
        tableName="experiment-items"
        columns={modeColumns}
        hidePagination
        rowHeight="s"
        onCustomRowHeightChange={onCustomRowHeightChange}
        data={{ isLoading: false, isError: false, data: rows }}
      />,
    );

    expect(screen.getAllByTestId("row-mode")[0]).toHaveTextContent("compact");
    expect(screen.getByText("zeta-score")).toHaveClass("truncate");

    const handle = screen.getByRole("slider", { name: "Row height" });
    act(() => {
      pointAt(handle, "pointerdown", 0);
      pointAt(handle, "pointermove", 68);
    });

    expect(onCustomRowHeightChange).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("row-mode")[0]).toHaveTextContent("expanded");
    expect(screen.getAllByTestId("row-mode")[1]).toHaveTextContent("compact");
    expect(screen.getByText("zeta-score")).not.toHaveClass("truncate");
    expect(screen.getByText("alpha-score")).toHaveClass("truncate");
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "96px" });
    }
    for (const box of rowBoxes(1)) {
      expect(box).toHaveStyle({ height: "28px", maxHeight: "28px" });
    }

    act(() => {
      pointAt(handle, "pointermove", 20);
    });
    expect(screen.getAllByTestId("row-mode")[0]).toHaveTextContent("compact");
    expect(screen.getAllByTestId("row-mode")[1]).toHaveTextContent("compact");
    expect(screen.getByText("zeta-score")).toHaveClass("truncate");
  });

  it("paints a committed custom height of Medium the same as the Medium preset", () => {
    const { rerender } = render(
      <DataTable
        tableName="experiment-items"
        columns={modeColumns}
        hidePagination
        rowHeight="m"
        data={{ isLoading: false, isError: false, data: rows }}
      />,
    );
    expect(screen.getAllByTestId("row-mode")[0]).toHaveTextContent("expanded");

    rerender(
      <DataTable
        tableName="experiment-items"
        columns={modeColumns}
        hidePagination
        rowHeight="s"
        customRowHeightPx={96}
        onCustomRowHeightChange={vi.fn()}
        data={{ isLoading: false, isError: false, data: rows }}
      />,
    );
    expect(screen.getAllByTestId("row-mode")[0]).toHaveTextContent("expanded");
    for (const box of document.querySelectorAll("[data-row-height]")) {
      expect(box).toHaveStyle({ height: "96px" });
    }

    rerender(
      <DataTable
        tableName="experiment-items"
        columns={modeColumns}
        hidePagination
        rowHeight="l"
        customRowHeightPx={95}
        onCustomRowHeightChange={vi.fn()}
        data={{ isLoading: false, isError: false, data: rows }}
      />,
    );
    expect(screen.getAllByTestId("row-mode")[0]).toHaveTextContent("compact");
  });

  const listHeights: CustomHeights = { s: "h-24", m: "h-48", l: "h-96" };
  const gridHeights: CustomHeights = { s: "h-48", m: "h-64", l: "h-96" };

  function renderSizedTable({
    heights,
    rowHeight = "m",
    customRowHeightPx,
    onCustomRowHeightChange = vi.fn(),
    onSelectRowHeight = vi.fn(),
  }: {
    heights?: CustomHeights;
    rowHeight?: RowHeight;
    customRowHeightPx?: number;
    onCustomRowHeightChange?: (heightPx: number) => void;
    onSelectRowHeight?: (rowHeight: RowHeight) => void;
  }) {
    render(
      <DataTable
        tableName="experiment-items"
        columns={columns}
        hidePagination
        rowHeight={rowHeight}
        customRowHeightPx={customRowHeightPx}
        customRowHeights={heights}
        onCustomRowHeightChange={onCustomRowHeightChange}
        onSelectRowHeight={onSelectRowHeight}
        data={{ isLoading: false, isError: false, data: rows }}
      />,
    );
  }

  it("shrinks an experiment list row from Medium to that table's Small", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(192),
    );
    const onCustomRowHeightChange = vi.fn();
    const onSelectRowHeight = vi.fn();
    renderSizedTable({
      heights: listHeights,
      onCustomRowHeightChange,
      onSelectRowHeight,
    });

    const handle = document.querySelector<HTMLElement>(
      'tr[data-row-index="1"] [data-row-resize-edge="last"]',
    );
    expect(handle).not.toBeNull();
    expect(screen.getByRole("slider", { name: "Row height" })).toHaveAttribute(
      "aria-valuemin",
      "96",
    );
    act(() => {
      pointAt(handle!, "pointerdown", 400);
      pointAt(handle!, "pointermove", 0);
    });
    for (const box of rowBoxes(1)) {
      expect(box).toHaveStyle({ height: "96px", maxHeight: "96px" });
    }
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "192px", maxHeight: "192px" });
    }

    act(() => {
      pointAt(handle!, "pointerup", 0);
    });
    expect(onCustomRowHeightChange).not.toHaveBeenCalled();
    expect(onSelectRowHeight).toHaveBeenCalledExactlyOnceWith("s");
  });

  it("shrinks an experiment grid row from Medium to that table's Small", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(256),
    );
    const onCustomRowHeightChange = vi.fn();
    const onSelectRowHeight = vi.fn();
    renderSizedTable({
      heights: gridHeights,
      onCustomRowHeightChange,
      onSelectRowHeight,
    });

    const handle = screen.getByRole("slider", { name: "Row height" });
    expect(handle).toHaveAttribute("aria-valuemin", "192");
    act(() => {
      pointAt(handle, "pointerdown", 400);
      pointAt(handle, "pointermove", 0);
    });
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "192px", maxHeight: "192px" });
    }
    for (const box of rowBoxes(1)) {
      expect(box).toHaveStyle({ height: "256px", maxHeight: "256px" });
    }

    act(() => {
      pointAt(handle, "pointerup", 0);
    });
    expect(onCustomRowHeightChange).not.toHaveBeenCalled();
    expect(onSelectRowHeight).toHaveBeenCalledExactlyOnceWith("s");
  });

  it("shrinks a custom experiment height down to Small", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect(300),
    );
    const onSelectRowHeight = vi.fn();
    renderSizedTable({
      heights: listHeights,
      customRowHeightPx: 300,
      onSelectRowHeight,
    });

    const handle = screen.getByRole("slider", { name: "Row height" });
    act(() => {
      pointAt(handle, "pointerdown", 500);
      pointAt(handle, "pointermove", 0);
    });
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "96px", maxHeight: "96px" });
    }
    for (const box of rowBoxes(1)) {
      expect(box).toHaveStyle({ height: "300px", maxHeight: "300px" });
    }

    act(() => {
      pointAt(handle, "pointerup", 0);
    });
    expect(onSelectRowHeight).toHaveBeenCalledExactlyOnceWith("s");
  });

  function CommittedHeightTable() {
    const [preset, setPreset] = useState<RowHeight>("m");
    const [px, setPx] = useState<number | undefined>(undefined);
    return (
      <DataTable
        tableName="traces"
        columns={columns}
        hidePagination
        rowHeight={preset}
        customRowHeightPx={px}
        onCustomRowHeightChange={setPx}
        onSelectRowHeight={(next) => {
          setPreset(next);
          setPx(undefined);
        }}
        data={{ isLoading: false, isError: false, data: rows }}
      />
    );
  }

  function installStackedRects(fallback: number) {
    const heightOf = (el: HTMLElement) => {
      const parsed = Number.parseFloat(el.style.height);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.tagName === "TR") {
          const rows = this.parentElement
            ? [
                ...this.parentElement.querySelectorAll<HTMLElement>(
                  "tr[data-row-index]",
                ),
              ]
            : [];
          let top = 0;
          for (const row of rows) {
            if (row === this) break;
            const box = row.querySelector<HTMLElement>("[data-row-height]");
            top += box ? heightOf(box) : fallback;
          }
          const own = this.querySelector<HTMLElement>("[data-row-height]");
          return rect(own ? heightOf(own) : fallback, top);
        }
        if (this.hasAttribute("data-row-height")) return rect(heightOf(this));
        return rect(fallback);
      },
    );
  }

  function prepareScroller(
    scrollHeight: number,
    clientHeight: number,
    scrollTop: number,
  ) {
    const node = document.querySelector("table")?.parentElement as HTMLElement;
    Object.defineProperty(node, "scrollHeight", {
      configurable: true,
      value: scrollHeight,
    });
    Object.defineProperty(node, "clientHeight", {
      configurable: true,
      value: clientHeight,
    });
    node.scrollTop = scrollTop;
    return node;
  }

  it("keeps the dragged row's top edge after every row takes the new height", () => {
    installStackedRects(96);
    render(<CommittedHeightTable />);
    const scroller = prepareScroller(5000, 400, 120);
    const handle = document.querySelector<HTMLElement>(
      'tr[data-row-index="1"] [data-row-resize-edge="last"]',
    );

    act(() => {
      pointAt(handle!, "pointerdown", 100);
      pointAt(handle!, "pointermove", 204);
    });
    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "96px" });
    }
    for (const box of rowBoxes(1)) {
      expect(box).toHaveStyle({ height: "200px" });
    }

    act(() => {
      pointAt(handle!, "pointerup", 204);
    });
    for (const box of [...rowBoxes(0), ...rowBoxes(1)]) {
      expect(box).toHaveStyle({ height: "200px", maxHeight: "200px" });
    }
    // The row above grew by 104px, so the scroller follows by the same amount.
    expect(scroller.scrollTop).toBe(224);
  });

  it("clamps the anchor when the list cannot scroll far enough", () => {
    installStackedRects(96);
    render(<CommittedHeightTable />);
    const scroller = prepareScroller(1000, 900, 50);
    const handle = document.querySelector<HTMLElement>(
      'tr[data-row-index="1"] [data-row-resize-edge="last"]',
    );

    act(() => {
      pointAt(handle!, "pointerdown", 0);
      pointAt(handle!, "pointerup", 400);
    });

    for (const box of rowBoxes(0)) {
      expect(box).toHaveStyle({ height: "496px" });
    }
    expect(scroller.scrollTop).toBe(100);
  });
});
