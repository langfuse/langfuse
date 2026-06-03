import { TableCheckboxLoadingCell } from "@/src/components/table/loading-cells";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  useOptionalTableSelectionStore,
  useTableRowIsSelected,
  useTableRowSelection,
} from "@/src/features/table/components/TableSelectionStoreContext";
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
}

function SelectionHeaderCheckbox<TData>({
  setSelectedRows,
  setSelectAll,
  table,
}: {
  setSelectedRows: (rows: RowSelectionState) => void;
  setSelectAll: (value: boolean) => void;
  table: Table<TData>;
}) {
  const selectionStore = useOptionalTableSelectionStore();
  const pageRows = table.getRowModel().rows;
  const pageRowIds = pageRows.map((row) => row.id);
  const rowSelection = useTableRowSelection(
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
        className="opacity-60"
      />
    </div>
  );
}

function SelectionRowCheckbox<TData>({
  row,
  setSelectAll,
}: {
  row: Row<TData>;
  setSelectAll: (value: boolean) => void;
}) {
  const selectionStore = useOptionalTableSelectionStore();
  const rowIsSelected = useTableRowIsSelected(row.id, row.getIsSelected());

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <Checkbox
        checked={rowIsSelected}
        onCheckedChange={(value) => {
          const nextChecked = !!value;

          if (selectionStore) {
            selectionStore.getState().actions.toggleRow(row.id, nextChecked);
            return;
          }

          row.toggleSelected(!!value);
          if (!value) setSelectAll(false);
        }}
        aria-label="Select row"
        className="opacity-60"
      />
    </div>
  );
}

export function TableSelectionManager<TData>({
  projectId: _projectId,
  tableName: _tableName,
  setSelectedRows,
  setSelectAll,
}: TableSelectionManagerProps) {
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
          setSelectedRows={setSelectedRows}
          setSelectAll={setSelectAll}
        />
      ),
      cell: ({ row }: { row: Row<TData> }) => (
        <SelectionRowCheckbox row={row} setSelectAll={setSelectAll} />
      ),
    },
  };
}
