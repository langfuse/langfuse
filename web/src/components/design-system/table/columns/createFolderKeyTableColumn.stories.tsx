import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createFolderKeyTableColumn } from "./createFolderKeyTableColumn";

type Row = {
  id: string;
  name: string | null;
  type: "folder" | "item";
};

const columns = [
  createFolderKeyTableColumn<Row>({
    accessorKey: "name",
    header: "Name",
    getCell: (name, { row }) => {
      if (!name) return undefined;

      if (row.original.type === "folder") {
        return { type: "folder", name, onClick: () => undefined };
      }

      return {
        type: "link",
        props: { path: `/items/${row.original.id}`, value: name },
      };
    },
  }),
];

function FolderKeyTableColumnStory({ data }: { data: AsyncTableData<Row[]> }) {
  return (
    <DataTable
      tableName="folder-key-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="comfortable"
    />
  );
}

const meta = preview.meta({
  component: FolderKeyTableColumnStory,
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
        { id: "folder-1", name: "Production", type: "folder" },
        { id: "item-1", name: "Generation prompt", type: "item" },
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
      data: [{ id: "item-1", name: null, type: "item" }],
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
