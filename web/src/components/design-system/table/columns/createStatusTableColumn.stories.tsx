import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createStatusTableColumn } from "./createStatusTableColumn";

type Row = {
  status: string | null;
  isStatusLoading?: boolean;
};

function StatusTableColumnStory({
  data,
  isLive = true,
  emptyValue,
}: {
  data: AsyncTableData<Row[]>;
  isLive?: boolean;
  emptyValue?: string;
}) {
  const columns = [
    createStatusTableColumn<Row, string>({
      accessorKey: "status",
      header: "Status",
      getStatus: (status, { row }) =>
        row.original.isStatusLoading
          ? { type: "loading" }
          : (status ?? undefined),
      isLive,
      emptyValue,
    }),
  ];

  return (
    <DataTable
      tableName="status-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="comfortable"
    />
  );
}

const meta = preview.meta({
  component: StatusTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ status: "running" }],
    },
  },
});

export const NotLive = meta.story({
  name: "Not Live",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ status: "completed" }],
    },
    isLive: false,
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ status: null }],
    },
    emptyValue: "-",
  },
});

export const UnknownStatus = meta.story({
  name: "Unknown Status",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ status: "legacy-status" }],
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

export const MappedValueLoading = meta.story({
  name: "Mapped Value Loading",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [
        { status: "pending-metrics", isStatusLoading: true },
        { status: "error" },
      ],
    },
  },
});
