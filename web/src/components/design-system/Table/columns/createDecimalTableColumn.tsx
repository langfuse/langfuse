import { type RowData } from "@tanstack/react-table";

import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { numberFormatter } from "@/src/utils/numbers";

export function createDecimalTableColumn<TData extends RowData>({
  accessorFn,
  id,
  maximumFractionDigits,
  ...columnOptions
}: Omit<
  LangfuseColumnDef<TData, number | null | undefined>,
  "accessorFn" | "accessorKey" | "cell" | "id" | "loadingCell"
> & {
  accessorFn: (row: TData) => number | null | undefined;
  id: string;
  maximumFractionDigits: number;
}): LangfuseColumnDef<TData, number | null | undefined> {
  return {
    ...columnOptions,
    // Langfuse column visibility still indexes every column by accessorKey.
    accessorKey: id,
    accessorFn,
    id,
    loadingCell: <TableTextLoadingCell />,
    cell: ({ getValue }) => {
      const value = getValue();

      return value === null || value === undefined ? null : (
        <span>{numberFormatter(value, 0, maximumFractionDigits)}</span>
      );
    },
  };
}
