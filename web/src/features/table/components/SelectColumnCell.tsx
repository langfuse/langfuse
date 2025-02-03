import { Checkbox } from "@/src/components/ui/checkbox";
import { type Row } from "@tanstack/react-table";

interface SelectionColumnCellProps<TData> {
  row: Row<TData>;
  setSelectAll: (value: boolean) => void;
}

export function SelectionColumnCell<TData>({
  row,
  setSelectAll,
}: SelectionColumnCellProps<TData>) {
  return (
    <Checkbox
      checked={row.getIsSelected()}
      onCheckedChange={(value) => {
        row.toggleSelected(!!value);
        if (!value) {
          setSelectAll(false);
        }
      }}
      aria-label="Select row"
      className="opacity-60"
    />
  );
}
