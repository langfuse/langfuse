import { fireEvent, render, screen } from "@testing-library/react";
import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";

type TestRow = { id: string };

function Harness() {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const { selectActionColumn } = TableSelectionManager<TestRow>({
    projectId: "project",
    tableName: "test",
    setSelectedRows: () => {},
    setSelectAll: () => {},
  });
  const data = useMemo(
    () => ["r1", "r2", "r3", "r4", "r5"].map((id) => ({ id })),
    [],
  );
  const table = useReactTable({
    data,
    columns: [selectActionColumn as ColumnDef<TestRow, unknown>],
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
  });

  return (
    <div>
      {table.getHeaderGroups().map((headerGroup) => (
        <div key={headerGroup.id}>
          {headerGroup.headers.map((header) => (
            <span key={header.id}>
              {flexRender(header.column.columnDef.header, header.getContext())}
            </span>
          ))}
        </div>
      ))}
      {table.getRowModel().rows.map((row) => (
        <div key={row.id}>
          {row.getVisibleCells().map((cell) => (
            <span key={cell.id}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// Re-query before every interaction: the column def is recreated per render,
// so flexRender remounts the checkbox cells and stale nodes go dead.
function getRowCheckboxes() {
  return screen.getAllByRole("checkbox", { name: "Select row" });
}

function clickRowCheckbox(index: number, options?: { shiftKey: boolean }) {
  fireEvent.click(getRowCheckboxes()[index]!, options);
}

function getCheckedStates() {
  return getRowCheckboxes().map(
    (checkbox) => checkbox.getAttribute("aria-checked") === "true",
  );
}

describe("TableSelectionManager shift-click range selection", () => {
  it("selects the range between the last clicked row and a shift-clicked row", () => {
    render(<Harness />);

    clickRowCheckbox(0);
    clickRowCheckbox(3, { shiftKey: true });

    expect(getCheckedStates()).toEqual([true, true, true, true, false]);
  });

  it("deselects the range when shift-clicking a selected row", () => {
    render(<Harness />);

    clickRowCheckbox(0);
    clickRowCheckbox(3, { shiftKey: true });
    // anchor is now r4; unchecking r2 with shift clears r2..r4
    clickRowCheckbox(1, { shiftKey: true });

    expect(getCheckedStates()).toEqual([true, false, false, false, false]);
  });

  it("treats a shift-click without a prior anchor as a single toggle", () => {
    render(<Harness />);

    clickRowCheckbox(2, { shiftKey: true });

    expect(getCheckedStates()).toEqual([false, false, true, false, false]);
  });

  it("plain clicks keep toggling single rows", () => {
    render(<Harness />);

    clickRowCheckbox(0);
    clickRowCheckbox(4);

    expect(getCheckedStates()).toEqual([true, false, false, false, true]);
  });

  it("header select-all/deselect-all resets the shift anchor", () => {
    render(<Harness />);

    clickRowCheckbox(0);
    const clickHeaderCheckbox = () =>
      fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    clickHeaderCheckbox();
    clickHeaderCheckbox();
    clickRowCheckbox(2, { shiftKey: true });

    expect(getCheckedStates()).toEqual([false, false, true, false, false]);
  });

  it("an emptied selection invalidates the shift anchor", () => {
    render(<Harness />);

    clickRowCheckbox(0);
    clickRowCheckbox(0); // selection is empty again, anchor would be stale
    clickRowCheckbox(3, { shiftKey: true });

    expect(getCheckedStates()).toEqual([false, false, false, true, false]);
  });
});
