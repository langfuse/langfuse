import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createIdTableColumn } from "./createIdTableColumn";

type Row = {
  promptVersion?: number;
  traceId: string | null;
};

function IdTableColumnStory({
  data,
  emptyValue,
  getValue,
}: {
  data: AsyncTableData<Row[]>;
  emptyValue?: string;
  getValue?: boolean;
}) {
  const columns = [
    createIdTableColumn<Row>({
      accessorKey: "traceId",
      header: "ID",
      emptyValue,
      getValue: getValue
        ? (value, { row }) =>
            value && row.original.promptVersion
              ? `${value} (v${row.original.promptVersion})`
              : undefined
        : undefined,
    }),
  ];

  return (
    <DataTable
      tableName="id-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="comfortable"
    />
  );
}

const meta = preview.meta({
  component: IdTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ traceId: "2f35e71c8a91471d" }],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ traceId: null }],
    },
  },
});

export const EmptyPlaceholder = meta.story({
  name: "Empty Placeholder",
  args: {
    emptyValue: "-",
    data: {
      isLoading: false,
      isError: false,
      data: [{ traceId: null }],
    },
  },
});

export const DerivedValue = meta.story({
  name: "Derived Value",
  args: {
    getValue: true,
    data: {
      isLoading: false,
      isError: false,
      data: [{ traceId: "prompt-name", promptVersion: 2 }],
    },
  },
});

export const Loading = meta.story({
  args: {
    data: {
      isLoading: true,
      isError: false,
    },
  },
});
