import { TableCheckboxLoadingCell } from "@/src/components/table/loading-cells";
import { Checkbox } from "@/src/components/ui/checkbox";
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
        <div className="flex h-full items-center">
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(value) => {
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
      ),
      cell: ({ row }: { row: Row<TData> }) => (
        <div
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => {
              row.toggleSelected(!!value);
              if (!value) setSelectAll(false);
            }}
            aria-label="Select row"
            className="opacity-60"
          />
        </div>
      ),
    },
  };
}
