import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createBadgeTableColumn } from "./createBadgeTableColumn";

type Row = {
  environment: string | null;
  status: "success" | "error";
};

const columns = [
  createBadgeTableColumn<Row>({
    id: "environment",
    accessorFn: (row) => row.environment,
    header: "Badge",
  }),
  createBadgeTableColumn<Row>({
    range: "semantic",
    accessorKey: "status",
    header: "Semantic badge",
    getBadge: (status) => ({
      value: status,
      variant: status === "success" ? "success" : "error",
    }),
  }),
];

function BadgeTableColumnStory({ data }: { data: AsyncTableData<Row[]> }) {
  return (
    <DataTable
      tableName="badge-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="comfortable"
    />
  );
}

const meta = preview.meta({
  component: BadgeTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ environment: "production", status: "success" }],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ environment: null, status: "error" }],
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
