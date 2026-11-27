import { type RowData } from "@tanstack/react-table";

import { Tag } from "@/src/components/design-system/Tag/Tag";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

/** A single value rendered as a filled, mono `Tag`, e.g. an environment. */
export function createTagTableColumn<TData extends RowData>({
  nullValue,
  ...options
}: TableColumnOptions<TData, string> & { nullValue?: string }) {
  return createTableColumn<TData, string>({
    ...options,
    loading: "badge",
    renderCell: (value) => {
      if (!value) {
        return nullValue ? (
          <span className="block w-full truncate" title={nullValue}>
            {nullValue}
          </span>
        ) : null;
      }

      return <Tag text={value} />;
    },
  });
}
