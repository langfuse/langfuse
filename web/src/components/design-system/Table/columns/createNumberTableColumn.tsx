import { type RowData } from "@tanstack/react-table";

import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { numberFormatter } from "@/src/utils/numbers";

type NumberAccessorKey<TData> = {
  [TKey in keyof TData]-?: NonNullable<TData[TKey]> extends number
    ? TKey
    : never;
}[keyof TData] &
  string;

type NumberAccessor<TData> =
  | {
      accessorKey: NumberAccessorKey<TData>;
      accessorFn?: never;
      id?: string;
    }
  | {
      accessorKey?: never;
      accessorFn: (row: TData) => number | null | undefined;
      id: string;
    };

export function createNumberTableColumn<TData extends RowData>({
  accessorFn,
  accessorKey,
  id: explicitId,
  minimumFractionDigits,
  maximumFractionDigits,
  ...columnOptions
}: Omit<
  LangfuseColumnDef<TData, number | null | undefined>,
  "accessorFn" | "accessorKey" | "cell" | "id" | "loadingCell"
> &
  NumberAccessor<TData> & {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }): LangfuseColumnDef<TData, number | null | undefined> {
  const minimumDigits =
    minimumFractionDigits ?? (maximumFractionDigits === undefined ? 2 : 0);
  const maximumDigits = Math.max(
    maximumFractionDigits ?? minimumDigits,
    minimumDigits,
  );
  const accessor = accessorFn
    ? {
        // Langfuse column visibility still indexes every column by accessorKey.
        accessorKey: explicitId,
        accessorFn,
        id: explicitId,
      }
    : {
        accessorKey,
        id: explicitId ?? accessorKey,
      };

  return {
    ...columnOptions,
    ...accessor,
    loadingCell: <TableTextLoadingCell />,
    cell: ({ getValue }) => {
      const value = getValue();

      return value === null || value === undefined ? null : (
        <span>{numberFormatter(value, minimumDigits, maximumDigits)}</span>
      );
    },
  };
}
