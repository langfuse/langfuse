import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createItemBadgeTableColumn } from "./createItemBadgeTableColumn";

type Row = {
  type: "GENERATION" | null;
};

const columns = [
  createItemBadgeTableColumn<Row>({
    id: "type",
    accessorFn: (row) => row.type,
    header: "Item Badge",
  }),
];

function ItemBadgeTableColumnStory({ data }: { data: AsyncTableData<Row[]> }) {
  return (
    <DataTable
      tableName="item-badge-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="comfortable"
    />
  );
}

const meta = preview.meta({
  component: ItemBadgeTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ type: "GENERATION" }],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ type: null }],
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
