import preview from "../../../../../.storybook/preview";
import { expect } from "storybook/test";

import { MediaTag } from "@/src/components/MediaTag/MediaTag";
import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { type MediaDescriptor } from "@/src/components/ui/media/mediaUtils";
import { createIOTableColumn } from "./createIOTableColumn";

type Row = {
  compact: unknown;
  input: unknown;
  isInputLoading?: boolean;
  output: unknown;
};

const renderMediaReference = (descriptor: MediaDescriptor) => (
  <MediaTag contentType={descriptor.contentType} status="idle" />
);

const columns = [
  createIOTableColumn<Row>({
    accessorKey: "input",
    header: "Input",
    size: 260,
    singleLine: true,
    enableExpandOnHover: true,
    renderMediaReference,
    getCell: (input, { row }) => {
      if (row.original.isInputLoading) return { type: "loading" };
      return input || undefined;
    },
  }),
  createIOTableColumn<Row>({
    accessorKey: "output",
    header: "Output",
    size: 260,
    singleLine: true,
    renderMediaReference,
    getCell: (output) => output || "-",
    variant: "output",
  }),
  createIOTableColumn<Row>({
    accessorKey: "compact",
    header: "Compact",
    size: 260,
    compact: true,
    renderMediaReference,
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

export const TestCustomFalsyHandling = meta.story({
  name: "(Test) Custom Falsy Handling",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ input: false, output: false, compact: false }],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("false")).toBeInTheDocument();
    await expect(canvas.getAllByText("false")).toHaveLength(1);
    await expect(canvas.getByText("-")).toBeInTheDocument();
  },
});
