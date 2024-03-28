import { type RowData, type ColumnDef } from "@tanstack/react-table";
import { type LucideIcon } from "lucide-react";

export type TableRowOptions = {
  columnId: string;
  options: { label: string; value: number; icon?: LucideIcon }[];
};

export type LangfuseColumnDef<
  TData extends RowData,
  TValue = unknown,
> = ColumnDef<TData, TValue> & {
  accessorKey: string;
  defaultHidden?: boolean;
  headerTooltip?: {
    description: string;
    href?: string;
  };
};
