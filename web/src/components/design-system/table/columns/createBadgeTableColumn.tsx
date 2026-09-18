/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";
import { type LucideIcon } from "lucide-react";

import { Badge, type BadgeProps } from "@/src/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createBadgeTableColumn<TData extends RowData>({
  getIcon,
  getVariant,
  ...options
}: TableColumnOptions<TData, string> & {
  getIcon?: (
    value: string,
    context: CellContext<TData, string | null | undefined>,
  ) => LucideIcon | undefined;
  getVariant?: (
    value: string,
    context: CellContext<TData, string | null | undefined>,
  ) => BadgeProps["variant"];
}) {
  return createTableColumn<TData, string>({
    ...options,
    loadingCell: <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />,
    renderCell: (value, context) => {
      if (!value) return null;

      const Icon = getIcon?.(value, context);

      return (
        <Badge
          variant={getVariant?.(value, context) ?? "secondary"}
          className="max-w-fit gap-1 truncate rounded-sm px-1 font-normal"
          title={value}
        >
          {Icon && <Icon className="size-3 shrink-0" aria-hidden />}
          <span className="truncate" title={value}>
            {value}
          </span>
        </Badge>
      );
    },
  });
}
