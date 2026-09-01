/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";

import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

type LinkProps = Pick<
  React.ComponentProps<typeof TextLink>,
  "path" | "value" | "title" | "onClick"
>;

export function createLinkListTableColumn<TData extends RowData>({
  getCell,
  ...options
}: TableColumnOptions<TData, string[]> & {
  getCell: (
    value: string[] | null | undefined,
    context: CellContext<TData, string[] | null | undefined>,
  ) => { type: "loading" } | LinkProps[] | undefined;
}) {
  return createTableColumn<TData, string[]>({
    ...options,
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (value, context) => {
      const cell = getCell(value, context);
      if (!cell) return null;
      if (!Array.isArray(cell)) return <Skeleton className="h-4 w-1/2" />;

      return (
        <div className="flex gap-1">
          {cell.map((linkProps) => (
            <TextLink
              key={linkProps.path}
              path={linkProps.path}
              value={linkProps.value}
              title={linkProps.title ?? linkProps.value}
              onClick={linkProps.onClick}
            />
          ))}
        </div>
      );
    },
  });
}
