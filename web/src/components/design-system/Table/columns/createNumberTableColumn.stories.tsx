import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createNumberTableColumn } from "./createNumberTableColumn";

type Row = {
  count: number | null;
  outputTokens: number;
  latency: number | null;
};

const columns = [
  createNumberTableColumn<Row>({
    accessorKey: "count",
    header: "Count",
    maximumFractionDigits: 0,
  }),
  createNumberTableColumn<Row>({
    id: "tokensPerSecond",
    accessorFn: (row) => (row.latency ? row.outputTokens / row.latency : null),
    header: "Tokens per second",
    maximumFractionDigits: 1,
  }),
];

function NumberTableColumnStory({ data }: { data: AsyncTableData<Row[]> }) {
  return (
    <DataTable
      tableName="number-column-story"
      columns={columns}
      data={data}
      hidePagination
    />
  );
}

const meta = preview.meta({
  component: NumberTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ count: 1234, outputTokens: 2469, latency: 2 }],
    },
  },
});

export const Zero = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ count: 0, outputTokens: 0, latency: 2 }],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ count: null, outputTokens: 2469, latency: null }],
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
