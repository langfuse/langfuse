import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createNumberTableColumn } from "./createNumberTableColumn";

type Row = {
  outputTokens: number;
  latency: number | null;
};

function NumberTableColumnStory({
  data,
  fractionDigits,
}: {
  data: AsyncTableData<Row[]>;
  fractionDigits: number;
}) {
  const columns = [
    createNumberTableColumn<Row>({
      id: "tokensPerSecond",
      accessorFn: (row) =>
        row.latency ? row.outputTokens / row.latency : null,
      header: "Number",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }),
  ];

  return (
    <DataTable
      tableName="number-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="comfortable"
    />
  );
}

const meta = preview.meta({
  component: NumberTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Decimal = meta.story({
  args: {
    fractionDigits: 1,
    data: {
      isLoading: false,
      isError: false,
      data: [{ outputTokens: 2469, latency: 2 }],
    },
  },
});

export const Integer = meta.story({
  args: {
    fractionDigits: 0,
    data: {
      isLoading: false,
      isError: false,
      data: [{ outputTokens: 2468, latency: 2 }],
    },
  },
});

export const Zero = meta.story({
  args: {
    fractionDigits: 0,
    data: {
      isLoading: false,
      isError: false,
      data: [{ outputTokens: 0, latency: 2 }],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    fractionDigits: 1,
    data: {
      isLoading: false,
      isError: false,
      data: [{ outputTokens: 2469, latency: null }],
    },
  },
});

export const Loading = meta.story({
  args: {
    fractionDigits: 1,
    data: {
      isLoading: true,
      isError: false,
    },
  },
});
