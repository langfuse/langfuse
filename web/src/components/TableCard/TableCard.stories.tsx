import { expect, fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { TableCard } from "./TableCard";

type Member = { id: string; name: string };

const meta = preview.meta({ component: TableCard<Member> });

const members: Member[] = [
  { id: "1", name: "Ada Andersen" },
  { id: "2", name: "Ben Hoffmann" },
  { id: "3", name: "Chloe Okafor" },
];

const columns = [
  createTextTableColumn<Member>({
    accessorFn: (row) => row.name,
    id: "name",
    header: "Name",
  }),
];

const pagination = {
  mode: "offset" as const,
  totalCount: 25,
  state: { pageIndex: 0, pageSize: 3 },
  onChange: fn(),
};

export const Default = meta.story({
  args: {
    tableName: "members",
    columns,
    data: { status: "success", data: members },
    pagination,
  },
});

export const AllPageRowsSelected = meta.story({
  args: {
    ...Default.input.args,
    multiSelect: {
      selectAll: false,
      setSelectAll: fn(),
      selectedRowIds: members.map((member) => member.id),
      setRowSelection: fn(),
      pageSize: 3,
      pageIndex: 0,
      totalCount: 25,
    },
  },
});

export const AllMatchingRowsSelected = meta.story({
  args: {
    ...AllPageRowsSelected.input.args,
    multiSelect: {
      ...AllPageRowsSelected.input.args.multiSelect,
      selectAll: true,
    },
  },
});

export const SelectAllAcrossPages = meta.story({
  name: "(Test) Selects all across pages",
  args: AllPageRowsSelected.input.args,
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Select all 25 items across 9 pages",
      }),
    );
    await expect(args.multiSelect?.setSelectAll).toHaveBeenCalledWith(true);
  },
});
