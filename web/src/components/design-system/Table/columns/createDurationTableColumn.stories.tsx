import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createDurationTableColumn } from "./createDurationTableColumn";

type Row = {
  latency: number | null;
};

const columns = [
  createDurationTableColumn<Row>({
    id: "latency",
    accessorFn: (row) => row.latency,
    header: "Duration",
  }),
];

function DurationTableColumnStory({ data }: { data: AsyncTableData<Row[]> }) {
  return (
    <DataTable
      tableName="duration-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="comfortable"
    />
  );
}

const meta = preview.meta({
  component: DurationTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ latency: 5.25 }],
    },
  },
});

export const Zero = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ latency: 0 }],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ latency: null }],
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
