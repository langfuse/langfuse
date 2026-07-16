import { useRef, type RefObject } from "react";
import { TableCheckboxLoadingCell } from "@/src/components/table/loading-cells";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  type TableSelectionStoreLike,
  useTableRowIsSelected,
  useTableRowSelection,
} from "@/src/components/table/table-selection-store";
import {
  type Table,
  type Row,
  type RowSelectionState,
} from "@tanstack/react-table";

interface TableSelectionManagerProps {
  projectId: string;
  tableName: string;
  setSelectedRows: (rows: RowSelectionState) => void;
  setSelectAll: (value: boolean) => void;
  /** External selection store; when set, checkboxes read/write it instead of TanStack rowSelection */
  selectionStore?: TableSelectionStoreLike;
}

function SelectionHeaderCheckbox<TData>({
  anchorRowIdRef,
  selectionStore,
  setSelectedRows,
  setSelectAll,
  table,
}: {
  anchorRowIdRef: RefObject<string | null>;
  selectionStore?: TableSelectionStoreLike;
  setSelectedRows: (rows: RowSelectionState) => void;
  setSelectAll: (value: boolean) => void;
  table: Table<TData>;
}) {
  const pageRows = table.getRowModel().rows;
  const pageRowIds = pageRows.map((row) => row.id);
  const rowSelection = useTableRowSelection(
    selectionStore,
    table.getState().rowSelection ?? {},
  );

  const allPageRowsSelected = selectionStore
    ? pageRowIds.length > 0 &&
      pageRowIds.every((rowId) => Boolean(rowSelection[rowId]))
    : table.getIsAllPageRowsSelected();
  const somePageRowsSelected = selectionStore
    ? !allPageRowsSelected &&
      pageRowIds.some((rowId) => Boolean(rowSelection[rowId]))
    : table.getIsSomePageRowsSelected();

  return (
    <div className="flex h-full items-center">
      <Checkbox
        checked={
          allPageRowsSelected
            ? true
            : somePageRowsSelected
              ? "indeterminate"
              : false
        }
        onCheckedChange={(value) => {
          const nextChecked = !!value;
          anchorRowIdRef.current = null;

          if (selectionStore) {
            if (nextChecked) {
              selectionStore
                .getState()
                .actions.togglePageRows(pageRowIds, nextChecked);
            } else {
              selectionStore.getState().actions.clearSelection();
            }
            return;
          }

          table.toggleAllPageRowsSelected(!!value);
          if (!value) {
            setSelectedRows({});
            setSelectAll(false);
          }
        }}
        aria-label="Select all"
      />
    </div>
  );
}

function SelectionRowCheckbox<TData>({
  row,
  table,
  anchorRowIdRef,
  selectionStore,
  setSelectAll,
}: {
  row: Row<TData>;
  table: Table<TData>;
  anchorRowIdRef: RefObject<string | null>;
  selectionStore?: TableSelectionStoreLike;
  setSelectAll: (value: boolean) => void;
}) {
  const shiftKeyRef = useRef(false);
  const rowIsSelected = useTableRowIsSelected(
    selectionStore,
    row.id,
    row.getIsSelected(),
  );

  const applyToRows = (rowIds: string[], nextSelected: boolean) => {
    if (selectionStore) {
      selectionStore.getState().actions.toggleRows(rowIds, nextSelected);
      return;
    }

    table.setRowSelection((previous) => {
      const next = { ...previous };
      for (const rowId of rowIds) {
        if (nextSelected) {
          next[rowId] = true;
        } else {
          delete next[rowId];
        }
      }
      return next;
    });
    if (!nextSelected) setSelectAll(false);
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
      }}
      onClickCapture={(e) => {
        shiftKeyRef.current = e.shiftKey;
      }}
      onMouseDown={(e) => {
        // prevent text selection between rows on shift-click
        if (e.shiftKey) e.preventDefault();
      }}
    >
      <Checkbox
        checked={rowIsSelected}
        onCheckedChange={(value) => {
          const nextChecked = !!value;
          const pageRows = table.getRowModel().rows;
          const currentIndex = pageRows.findIndex(
            (pageRow) => pageRow.id === row.id,
          );
          // a range needs a live anchor: global clears (banner, action menu,
          // dialog close) empty the selection, which invalidates the anchor
          const currentRowSelection = selectionStore
            ? selectionStore.getState().rowSelection
            : (table.getState().rowSelection ?? {});
          const anchorIsLive =
            shiftKeyRef.current && Object.keys(currentRowSelection).length > 0;
          const anchorIndex = anchorIsLive
            ? pageRows.findIndex(
                (pageRow) => pageRow.id === anchorRowIdRef.current,
              )
            : -1;
          shiftKeyRef.current = false;
          anchorRowIdRef.current = row.id;

          if (anchorIndex !== -1 && currentIndex !== -1) {
            const [from, to] =
              anchorIndex < currentIndex
                ? [anchorIndex, currentIndex]
                : [currentIndex, anchorIndex];
            applyToRows(
              pageRows.slice(from, to + 1).map((pageRow) => pageRow.id),
              nextChecked,
            );
            return;
          }

          if (selectionStore) {
            selectionStore.getState().actions.toggleRow(row.id, nextChecked);
            return;
          }

          row.toggleSelected(!!value);
          if (!value) setSelectAll(false);
        }}
        aria-label="Select row"
      />
    </div>
  );
}

export function TableSelectionManager<TData>({
  projectId: _projectId,
  tableName: _tableName,
  setSelectedRows,
  setSelectAll,
  selectionStore,
}: TableSelectionManagerProps) {
  // last explicitly clicked row; shift-click selects the range from it
  const anchorRowIdRef = useRef<string | null>(null);

  return {
    selectActionColumn: {
      id: "select",
      accessorKey: "select",
      size: 35,
      isFixedPosition: true,
      isPinnedLeft: true,
      loadingCell: <TableCheckboxLoadingCell />,
      header: ({ table }: { table: Table<TData> }) => (
        <SelectionHeaderCheckbox
          table={table}
          anchorRowIdRef={anchorRowIdRef}
          selectionStore={selectionStore}
          setSelectedRows={setSelectedRows}
          setSelectAll={setSelectAll}
        />
      ),
      cell: ({ row, table }: { row: Row<TData>; table: Table<TData> }) => (
        <SelectionRowCheckbox
          row={row}
          table={table}
          anchorRowIdRef={anchorRowIdRef}
          selectionStore={selectionStore}
          setSelectAll={setSelectAll}
        />
      ),
    },
  };
}
