import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createDecimalTableColumn } from "./createDecimalTableColumn";

type Row = {
  outputTokens: number;
  latency: number | null;
};

const columns = [
  createDecimalTableColumn<Row>({
    id: "tokensPerSecond",
    accessorFn: (row) => (row.latency ? row.outputTokens / row.latency : null),
    header: "Tokens per second",
    maximumFractionDigits: 1,
  }),
];

function DecimalTableColumnStory({ data }: { data: AsyncTableData<Row[]> }) {
  return (
    <DataTable
      tableName="decimal-column-story"
      columns={columns}
      data={data}
      hidePagination
    />
  );
}

const meta = preview.meta({
  component: DecimalTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ outputTokens: 2469, latency: 2 }],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ outputTokens: 2469, latency: null }],
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
