import type { ReactNode } from "react";

import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createDateTableColumn } from "./createDateTableColumn";

type Row = {
  timestamp: Date | null;
};

function DateTableColumnStory({
  data,
  getPrefix,
}: {
  data: AsyncTableData<Row[]>;
  getPrefix?: (value: Date) => ReactNode;
}) {
  const columns = [
    createDateTableColumn<Row>({
      id: "timestamp",
      accessorFn: (row) => row.timestamp,
      header: "Date",
      getPrefix,
    }),
  ];

  return (
    <DataTable
      tableName="date-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="comfortable"
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

export const WithPrefix = meta.story({
  name: "With Prefix",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ timestamp: new Date("2026-01-15T10:30:00.000Z") }],
    },
    getPrefix: () => "Started on ",
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
