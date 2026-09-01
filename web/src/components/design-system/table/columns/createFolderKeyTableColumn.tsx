/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";
import { Folder } from "lucide-react";

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

export function createFolderKeyTableColumn<
  TData extends RowData,
  TValue = string,
>({
  getCell,
  ...options
}: TableColumnOptions<TData, TValue> & {
  getCell: (
    value: TValue | null | undefined,
    context: CellContext<TData, TValue | null | undefined>,
  ) =>
    | { type: "folder"; name: string; onClick: () => void }
    | { type: "link"; props: LinkProps }
    | undefined;
}) {
  return createTableColumn<TData, TValue>({
    ...options,
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (value, context) => {
      const cell = getCell(value, context);
      if (!cell) return null;

      if (cell.type === "folder") {
        return (
          <TextLink
            path=""
            value={cell.name}
            icon={Folder}
            onClick={cell.onClick}
            title={cell.name}
          />
        );
      }

      return (
        <TextLink
          path={cell.props.path}
          value={cell.props.value}
          title={cell.props.title ?? cell.props.value}
          onClick={cell.props.onClick}
        />
      );
    },
  });
}
