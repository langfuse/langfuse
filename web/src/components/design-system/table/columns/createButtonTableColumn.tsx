/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";

import { Button } from "@/src/components/design-system/Button/Button";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createButtonTableColumn<TData extends RowData, TValue>({
  getButton,
  ...options
}: TableColumnOptions<TData, TValue> & {
  getButton: (context: CellContext<TData, TValue | null | undefined>) => {
    text: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
}) {
  return createTableColumn<TData, TValue>({
    ...options,
    enableResizing: false,
    loadingCell: <Skeleton className="h-8 w-16" />,
    renderCell: (_, context) => {
      const buttonProps = getButton(context);
      return (
        <div>
          <Button size="sm" {...buttonProps} />
        </div>
      );
    },
  });
}
