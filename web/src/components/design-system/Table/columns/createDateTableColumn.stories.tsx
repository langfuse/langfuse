import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createDateTableColumn } from "./createDateTableColumn";

type Row = {
  timestamp: Date | null;
};

const columns = [
  createDateTableColumn<Row>({
    accessorKey: "timestamp",
    header: "Timestamp",
  }),
];

function DateTableColumnStory({ data }: { data: AsyncTableData<Row[]> }) {
  return (
    <DataTable
      tableName="date-column-story"
      columns={columns}
      data={data}
      hidePagination
    />
  );
}

const meta = preview.meta({
  component: DateTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ timestamp: new Date("2026-01-15T10:30:00.000Z") }],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ timestamp: null }],
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
