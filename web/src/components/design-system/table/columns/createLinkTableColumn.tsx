/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";

import {
  TextLink,
  type TextLinkIconProps,
} from "@/src/components/design-system/TextLink/TextLink";
import { EmptyValue } from "@/src/components/design-system/table/components/EmptyValue/EmptyValue";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

type LinkTableColumnProps = Pick<
  React.ComponentProps<typeof TextLink>,
  "path" | "value" | "title" | "onClick"
> &
  TextLinkIconProps;

export function createLinkTableColumn<TData extends RowData, TValue = string>({
  getCell,
  ...options
}: TableColumnOptions<TData, TValue> & {
  getCell: (
    value: TValue | null | undefined,
    context: CellContext<TData, TValue | null | undefined>,
  ) =>
    | { type: "loading" }
    | { type: "empty" }
    | { type: "text"; value: string }
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
      if (cell.type === "empty") return <EmptyValue />;
      if (cell.type === "text") return <span>{cell.value}</span>;

      return (
        <TextLink
          {...cell.props}
          title={cell.props.title ?? cell.props.value}
        />
      );
    },
  });
}
