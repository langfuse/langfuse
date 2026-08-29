import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { numberFormatter } from "@/src/utils/numbers";
import { createNumberTableColumn } from "./createNumberTableColumn";

type Row = {
  isNumberLoading?: boolean;
  outputTokens: number;
  latency: number | null;
};

function NumberTableColumnStory({
  data,
  emptyValue,
  fractionDigits,
}: {
  data: AsyncTableData<Row[]>;
  emptyValue?: string;
  fractionDigits: number;
}) {
  const columns = [
    createNumberTableColumn<Row>({
      id: "tokensPerSecond",
      accessorFn: (row) =>
        row.latency ? row.outputTokens / row.latency : null,
      header: "Number",
      emptyValue,
      formatter: (value) =>
        numberFormatter(value, fractionDigits, fractionDigits),
      getValue: (value, { row }) => {
        if (row.original.isNumberLoading) return { type: "loading" };
        if (value === null || value === undefined) return undefined;

        return value;
      },
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

export const EmptyPlaceholder = meta.story({
  name: "Empty Placeholder",
  args: {
    emptyValue: "—",
    fractionDigits: 1,
    data: {
      isLoading: false,
      isError: false,
      data: [{ outputTokens: 2469, latency: null }],
    },
  },
});

export const CellLoading = meta.story({
  name: "Cell Loading",
  args: {
    fractionDigits: 1,
    data: {
      isLoading: false,
      isError: false,
      data: [{ isNumberLoading: true, outputTokens: 2469, latency: null }],
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
