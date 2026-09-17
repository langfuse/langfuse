import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createUserTableColumn } from "./createUserTableColumn";

type Row = {
  isUserLoading?: boolean;
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
};

const avatarColumns = [
  createUserTableColumn<Row>({
    accessorKey: "user",
    header: "User",
    variant: "avatar",
    emptyValue: "Unknown",
    getUser: (user, { row }) => {
      if (row.original.isUserLoading) return { type: "loading" };
      if (!user) return undefined;

      return { type: "user", user };
    },
  }),
];

const textColumns = [
  createUserTableColumn<Row>({
    accessorKey: "user",
    header: "User",
    variant: "text",
    emptyValue: "API",
  }),
];

function UserTableColumnStory({
  data,
  variant,
}: {
  data: AsyncTableData<Row[]>;
  variant: "avatar" | "text";
}) {
  return (
    <DataTable
      tableName="user-column-story"
      columns={variant === "avatar" ? avatarColumns : textColumns}
      data={data}
      hidePagination
      cellPadding="comfortable"
    />
  );
}

const meta = preview.meta({
  component: UserTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    variant: "avatar",
    data: {
      isLoading: false,
      isError: false,
      data: [
        {
          user: {
            name: "Ada Lovelace",
            email: "ada@example.com",
            image: null,
          },
        },
      ],
    },
  },
});

export const TextOnly = meta.story({
  name: "Text Only",
  args: {
    variant: "text",
    data: {
      isLoading: false,
      isError: false,
      data: [
        {
          user: {
            name: null,
            email: "ada@example.com",
            image: null,
          },
        },
      ],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    variant: "avatar",
    data: {
      isLoading: false,
      isError: false,
      data: [{ user: {} }],
    },
  },
});

export const AbsentUser = meta.story({
  name: "Absent User",
  args: {
    variant: "avatar",
    data: {
      isLoading: false,
      isError: false,
      data: [{ user: null }],
    },
  },
});

export const CellLoading = meta.story({
  name: "Cell Loading",
  args: {
    variant: "avatar",
    data: {
      isLoading: false,
      isError: false,
      data: [{ isUserLoading: true, user: null }],
    },
  },
});

export const Loading = meta.story({
  args: {
    variant: "avatar",
    data: {
      isLoading: true,
      isError: false,
    },
  },
});
