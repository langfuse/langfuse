import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import { createDropdownTableColumn } from "./createDropdownTableColumn";

type Row = {
  id: string | null;
};

function DropdownTableColumnStory({
  data,
  onDelete = fn(),
}: {
  data: AsyncTableData<Row[]>;
  onDelete?: (id: string) => void;
}) {
  const columns = [
    createDropdownTableColumn<Row, string>({
      id: "actions",
      accessorFn: (row) => row.id,
      header: "Actions",
      size: 70,
      renderMenu: (id) =>
        id ? (
          <DropdownMenuItem onClick={() => onDelete(id)}>
            Delete
          </DropdownMenuItem>
        ) : null,
    }),
  ];

  return (
    <DataTable
      tableName="dropdown-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="comfortable"
    />
  );
}

const meta = preview.meta({
  component: DropdownTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ id: "trace-1" }],
    },
    onDelete: fn(),
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ id: null }],
    },
    onDelete: fn(),
  },
});

export const Loading = meta.story({
  args: {
    data: {
      isLoading: true,
      isError: false,
    },
    onDelete: fn(),
  },
});

export const TestOpensMenu = meta.story({
  name: "(Test) Opens Menu",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ id: "trace-1" }],
    },
    onDelete: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Open menu" });

    await userEvent.click(trigger);

    const menu = await within(canvasElement.ownerDocument.body).findByRole(
      "menu",
    );
    const item = within(menu).getByRole("menuitem", { name: "Delete" });
    await expect(item).toBeInTheDocument();

    await userEvent.click(item);
    await expect(args.onDelete).toHaveBeenCalledWith("trace-1");
  },
});
