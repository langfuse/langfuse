import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createLinkTableColumn } from "./createLinkTableColumn";

type Row = {
  id: string;
  isLinkLoading?: boolean;
  name: string | null;
};

const columns = [
  createLinkTableColumn<Row>({
    id: "name",
    accessorFn: (row) => row.name,
    header: "Link",
    getCell: (name, { row }) => {
      if (row.original.isLinkLoading) return { type: "loading" };
      if (!name) return undefined;

      return {
        type: "link",
        props: { path: `/items/${row.original.id}`, value: name },
      };
    },
  }),
];

function LinkTableColumnStory({ data }: { data: AsyncTableData<Row[]> }) {
  return (
    <DataTable
      tableName="link-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="comfortable"
    />
  );
}

const meta = preview.meta({
  component: LinkTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ id: "item-1", name: "Production generation" }],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ id: "item-1", name: null }],
    },
  },
});

export const CellLoading = meta.story({
  name: "Cell Loading",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ id: "item-1", isLinkLoading: true, name: null }],
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
