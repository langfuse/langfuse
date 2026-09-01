/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";
import { MoreVertical } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { DropdownMenuController } from "@/src/components/ui/dropdown-menu";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createDropdownTableColumn<
  TData extends RowData,
  TValue = unknown,
>({
  renderMenu,
  ...options
}: TableColumnOptions<TData, TValue> & {
  renderMenu: (
    value: TValue | null | undefined,
    context: CellContext<TData, TValue | null | undefined>,
  ) => React.ReactNode;
}) {
  return createTableColumn<TData, TValue>({
    ...options,
    loadingCell: <Skeleton className="h-8 w-8 shrink-0 rounded-md" />,
    renderCell: (value, context) => {
      const items = renderMenu(value, context);
      if (!items) return null;

      return (
        <div onClick={(event) => event.stopPropagation()}>
          <DropdownMenuController align="end" renderMenu={() => items}>
            {({ Trigger }) => (
              <Trigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </Trigger>
            )}
          </DropdownMenuController>
        </div>
      );
    },
  });
}
