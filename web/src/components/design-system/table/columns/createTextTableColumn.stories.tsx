import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createTextTableColumn } from "./createTextTableColumn";

type Row = {
  name: string | null;
  count: number | null;
  isCountLoading?: boolean;
};

const columns = [
  createTextTableColumn<Row>({
    id: "name",
    accessorFn: (row) => row.name,
    header: "Text",
  }),
  createTextTableColumn<Row, number>({
    accessorKey: "count",
    header: "Mapped text",
    mapValue: (value, { row }) =>
      row.original.isCountLoading
        ? { type: "loading" }
        : value?.toLocaleString(),
  }),
];

function TextTableColumnStory({ data }: { data: AsyncTableData<Row[]> }) {
  return (
    <DataTable
      tableName="text-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="comfortable"
    />
  );
}

const meta = preview.meta({
  component: TextTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ name: "Production generation", count: 1200 }],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ name: null, count: null }],
    },
  },
});

export const MappedValueLoading = meta.story({
  name: "Mapped Value Loading",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [
        { name: "Production generation", count: null, isCountLoading: true },
      ],
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
