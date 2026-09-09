import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createLinkListTableColumn } from "./createLinkListTableColumn";

type Row = {
  isLinkListLoading?: boolean;
  userIds: string[] | null;
};

const columns = [
  createLinkListTableColumn<Row>({
    accessorKey: "userIds",
    header: "User IDs",
    getCell: (userIds, { row }) => {
      if (row.original.isLinkListLoading) return { type: "loading" };
      if (!userIds?.length) return undefined;

      return userIds.map((userId) => ({
        path: `/users/${encodeURIComponent(userId)}`,
        value: userId,
      }));
    },
  }),
];

function LinkListTableColumnStory({ data }: { data: AsyncTableData<Row[]> }) {
  return (
    <DataTable
      tableName="link-list-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="comfortable"
    />
  );
}

const meta = preview.meta({
  component: LinkListTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ userIds: ["user-1", "user-2"] }],
    },
  },
});

export const Empty = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ userIds: null }],
    },
  },
});

export const CellLoading = meta.story({
  name: "Cell Loading",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ isLinkListLoading: true, userIds: null }],
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
