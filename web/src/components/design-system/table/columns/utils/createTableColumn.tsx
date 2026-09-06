/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";

import { type LangfuseColumnDef } from "@/src/components/table/types";

type NullableTableColumnValue<TValue> = TValue | null | undefined;

type TableColumnAccessorKey<TData, TValue> = {
  [TKey in keyof TData]-?: [NonNullable<TData[TKey]>] extends [never]
    ? never
    : NonNullable<TData[TKey]> extends TValue
      ? TKey
      : never;
}[keyof TData] &
  string;

type TableColumnAccessor<TData, TValue> =
  | {
      accessorKey: TableColumnAccessorKey<TData, TValue>;
      accessorFn?: never;
      id?: never;
    }
  | {
      accessorKey?: never;
      accessorFn: (
        originalRow: TData,
        index: number,
      ) => NullableTableColumnValue<TValue>;
      id: string;
    };

export type TableColumnOptions<TData extends RowData, TValue> = Omit<
  LangfuseColumnDef<TData, NullableTableColumnValue<TValue>>,
  "accessorFn" | "accessorKey" | "cell" | "id" | "loadingCell"
> &
  TableColumnAccessor<TData, TValue>;

export function createTableColumn<TData extends RowData, TValue>({
  accessorFn,
  accessorKey,
  id: explicitId,
  loadingCell,
  renderCell,
  ...columnOptions
}: TableColumnOptions<TData, TValue> & {
  loadingCell: React.ReactNode | (() => React.ReactNode);
  renderCell: (
    value: NullableTableColumnValue<TValue>,
    context: CellContext<TData, NullableTableColumnValue<TValue>>,
  ) => React.ReactNode;
}): LangfuseColumnDef<TData> {
  const accessor = accessorFn
    ? {
        // Langfuse column visibility still indexes every column by accessorKey.
        accessorKey: explicitId,
        accessorFn,
        id: explicitId,
      }
    : {
        accessorKey,
        id: accessorKey,
      };

  const column: LangfuseColumnDef<TData, NullableTableColumnValue<TValue>> = {
    ...columnOptions,
    ...accessor,
    loadingCell,
    cell: (context) => renderCell(context.getValue(), context),
  };

  // TanStack's TValue is invariant, so expose unknown when columns enter a
  // mixed array while retaining the specialized value type inside the creator.
  return column as unknown as LangfuseColumnDef<TData>;
}
