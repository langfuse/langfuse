import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import {
  createIOTableColumn,
  IO_TABLE_COLUMN_LOADING,
} from "./createIOTableColumn";

type Row = {
  compact: unknown;
  input: unknown;
  isInputLoading?: boolean;
  output: unknown;
};

const columns = [
  createIOTableColumn<Row>({
    accessorKey: "input",
    header: "Input",
    size: 260,
    singleLine: true,
    enableExpandOnHover: true,
    getCell: (input, { row }) => {
      if (row.original.isInputLoading) return IO_TABLE_COLUMN_LOADING;
      if (input === null || input === undefined) return undefined;
      return input;
    },
  }),
  createIOTableColumn<Row>({
    accessorKey: "output",
    header: "Output",
    size: 260,
    singleLine: true,
    variant: "output",
  }),
  createIOTableColumn<Row>({
    accessorKey: "compact",
    header: "Compact",
    size: 260,
    compact: true,
  }),
];

function IOTableColumnStory({ data }: { data: AsyncTableData<Row[]> }) {
  return (
    <DataTable
      tableName="io-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="none"
    />
  );
}

const meta = preview.meta({
  component: IOTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [
        {
          input: { prompt: "What is Langfuse?" },
          output: { answer: "An open-source LLM engineering platform." },
          compact: { model: "gpt-5" },
        },
      ],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ input: null, output: null, compact: null }],
    },
  },
});

export const CellLoading = meta.story({
  name: "Cell Loading",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [
        {
          input: null,
          output: { answer: "Available" },
          compact: { model: "gpt-5" },
          isInputLoading: true,
        },
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
