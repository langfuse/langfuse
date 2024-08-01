import { type RowData, type ColumnDef } from "@tanstack/react-table";
import { type LucideIcon } from "lucide-react";

export type TableRowOptions = {
  columnId: string;
  options: { label: string; value: number; icon?: LucideIcon }[];
};

type ExtendedColumnDef<TData extends RowData, TValue = unknown> = ColumnDef<
  TData,
  TValue
> & {
  defaultHidden?: boolean;
  headerTooltip?: {
    description: string;
    href?: string;
  };
};

export type LangfuseColumnDef<
  TData extends RowData,
  TValue = unknown,
> = ExtendedColumnDef<TData, TValue> & {
  // Enforce columns to be of type 'AccessorKeyColumnDefBase' with 'accessorKey' property of type string
  accessorKey: string;
  // Enforce columns to be of type 'StringHeaderIdentifier' with 'header' property of type string
  columns?: LangfuseColumnDef<TData, TValue>[];
};
