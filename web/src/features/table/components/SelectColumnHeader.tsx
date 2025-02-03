import { Checkbox } from "@/src/components/ui/checkbox";
import { type Table } from "@tanstack/react-table";

interface SelectionColumnHeaderProps<TData> {
  table: Table<TData>;
  setSelectedRows: (rows: Record<string, boolean>) => void;
  setSelectAll: (value: boolean) => void;
}

export function SelectionColumnHeader<TData>({
  table,
  setSelectedRows,
  setSelectAll,
}: SelectionColumnHeaderProps<TData>) {
  return (
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
  );
}
