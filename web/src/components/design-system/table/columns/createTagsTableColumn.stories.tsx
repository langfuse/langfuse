import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createTagsTableColumn } from "./createTagsTableColumn";

type Row = {
  tags: string[];
};

function TagsTableColumnStory({
  data,
  shouldWrap,
}: {
  data: AsyncTableData<Row[]>;
  shouldWrap: boolean;
}) {
  const columns = [
    createTagsTableColumn<Row>({
      id: "tags",
      accessorFn: (row) => row.tags,
      header: "Tags",
      shouldWrap,
    }),
  ];

  return (
    <DataTable
      tableName="tags-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="comfortable"
    />
  );
}

const meta = preview.meta({
  component: TagsTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ tags: ["production", "customer-facing"] }],
    },
    shouldWrap: true,
  },
});

export const WithoutWrapping = meta.story({
  name: "Without Wrapping",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ tags: ["production", "customer-facing"] }],
    },
    shouldWrap: false,
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ tags: [] }],
    },
    shouldWrap: true,
  },
});

export const Loading = meta.story({
  args: {
    data: {
      isLoading: true,
      isError: false,
    },
    shouldWrap: true,
  },
});
