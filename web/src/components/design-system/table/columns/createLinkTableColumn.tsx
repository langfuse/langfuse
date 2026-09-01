/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";
import { type LucideIcon } from "lucide-react";

import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

type LinkTableColumnProps = Pick<
  React.ComponentProps<typeof TextLink>,
  "path" | "value" | "title" | "onClick"
> & {
  icon?: LucideIcon;
};

export function createLinkTableColumn<TData extends RowData, TValue = string>({
  getCell,
  ...options
}: TableColumnOptions<TData, TValue> & {
  getCell: (
    value: TValue | null | undefined,
    context: CellContext<TData, TValue | null | undefined>,
  ) =>
    | { type: "loading" }
    | { type: "link"; props: LinkTableColumnProps }
    | undefined;
}) {
  return createTableColumn<TData, TValue>({
    ...options,
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (value, context) => {
      const cell = getCell(value, context);
      if (!cell) return null;
      if (cell.type === "loading") return <Skeleton className="h-4 w-1/2" />;

      const { icon: Icon, path, value: linkValue, title, onClick } = cell.props;
      return (
        <TextLink
          path={path}
          value={linkValue}
          title={title ?? linkValue}
          onClick={onClick}
          icon={Icon}
        />
      );
    },
  });
}
