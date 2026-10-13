import { Pencil } from "lucide-react";
import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";

import {
  Table,
  type AsyncTableData,
} from "@/src/components/design-system/table/Table";
import { createTextTableColumn } from "./createTextTableColumn";

type Row = {
  name: string | null;
  count: number | null;
  isCountLoading?: boolean;
};

const columns = [
  createTextTableColumn<Row>({
    id: "name",
    accessorFn: (row) => row.name,
    header: "Copyable text",
    trailingAction: { type: "copy-to-clipboard" },
  }),
  createTextTableColumn<Row>({
    id: "name-with-tooltip",
    accessorFn: (row) => row.name,
    header: "Text with tooltip",
    tooltip: ({ row }) =>
      row.original.name
        ? `Created: today\nCount: ${row.original.count ?? "—"}`
        : undefined,
  }),
  createTextTableColumn<Row, number>({
    accessorKey: "count",
    header: "Mapped text with action",
    mapValue: (value, { row }) =>
      row.original.isCountLoading
        ? { type: "loading" }
        : value?.toLocaleString(),
    nullValue: "—",
    trailingAction: {
      type: "custom",
      icon: Pencil,
      label: "Edit value",
      onClick: fn(),
    },
  }),
];

function TextTableColumnStory({ data }: { data: AsyncTableData<Row[]> }) {
  return <Table tableName="text-column-story" columns={columns} data={data} />;
}

const meta = preview.meta({
  component: TextTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      status: "success",
      data: [{ name: "Production generation", count: 1200 }],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    data: {
      status: "success",
      data: [{ name: null, count: null }],
    },
  },
});

export const MappedValueLoading = meta.story({
  name: "Mapped Value Loading",
  args: {
    data: {
      status: "success",
      data: [
        { name: "Production generation", count: null, isCountLoading: true },
      ],
    },
  },
});

export const Loading = meta.story({
  args: {
    data: {
      status: "loading",
    },
  },
});
