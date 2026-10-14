import { type OrderByState } from "@langfuse/shared";
import { useState } from "react";
import preview from "../../../../.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";

import { Table } from "./Table";
import { createBadgeTableColumn } from "./columns/createBadgeTableColumn";
import { createDateTableColumn } from "./columns/createDateTableColumn";
import { createTextTableColumn } from "./columns/createTextTableColumn";

type Row = {
  createdAt: Date;
  description: string;
  name: string;
  status: "Active" | "Draft";
};

const columns = [
  createTextTableColumn<Row>({
    accessorKey: "name",
    header: "Name",
  }),
  createTextTableColumn<Row>({
    accessorKey: "description",
    header: "Description",
  }),
  createBadgeTableColumn<Row>({
    accessorKey: "status",
    header: "Status",
  }),
  createDateTableColumn<Row>({
    accessorKey: "createdAt",
    header: "Created at",
  }),
];
const onView = fn();

type TableStoryProps = Parameters<typeof Table<Row>>[0];

function TableStory(props: TableStoryProps) {
  return <Table<Row> {...props} />;
}

const sortableColumns = [
  createTextTableColumn<Row>({
    accessorKey: "name",
    header: "Name",
    enableSorting: true,
  }),
  createDateTableColumn<Row>({
    accessorKey: "createdAt",
    header: "Created at",
    enableSorting: true,
  }),
];

const sortableRows: Row[] = [
  {
    createdAt: new Date("2026-09-18"),
    description: "Team analytics overview",
    name: "Dashboard",
    status: "Active",
  },
  {
    createdAt: new Date("2026-09-17"),
    description: "Reusable chart configuration",
    name: "Widget",
    status: "Draft",
  },
];

function SortableTableStory() {
  const [orderBy, setOrderBy] = useState<OrderByState>(null);
  const rows = [...sortableRows];

  if (orderBy?.column === "name") {
    rows.sort((left, right) => left.name.localeCompare(right.name));
  }
  if (orderBy?.column === "createdAt") {
    rows.sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
  }
  if (orderBy?.order === "DESC") rows.reverse();

  return (
    <Table
      tableName="sortable-table-story"
      columns={sortableColumns}
      data={{ status: "success", data: rows }}
      orderBy={orderBy}
      setOrderBy={setOrderBy}
    />
  );
}

const meta = preview.meta({
  component: TableStory,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    tableName: "design-system-table-story",
    columns,
    actions: () => [
      {
        id: "view",
        type: "item" as const,
        title: "View details",
        onClick: onView,
      },
    ],
  },
});

export const Default = meta.story({
  name: "(Test) Default",
  args: {
    data: {
      status: "success",
      data: [
        {
          createdAt: new Date("2026-09-18"),
          description: "Team analytics overview",
          name: "Dashboard",
          status: "Active",
        },
        {
          createdAt: new Date("2026-09-17"),
          description: "Reusable chart configuration",
          name: "Widget",
          status: "Draft",
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getAllByRole("button", { name: "Open actions menu" })[0],
    );
    const menu = await within(canvasElement.ownerDocument.body).findByRole(
      "menu",
    );
    await userEvent.click(
      within(menu).getByRole("button", { name: "View details" }),
    );
    await expect(onView).toHaveBeenCalled();
  },
});

export const Loading = meta.story({
  args: {
    data: {
      status: "loading",
    },
  },
});

export const Sorting = meta.story({
  name: "(Test) Sorts columns",
  args: {
    data: { status: "success", data: sortableRows },
  },
  render: () => <SortableTableStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nameHeader = canvas.getByRole("columnheader", { name: /Name/ });

    await expect(nameHeader).toHaveAttribute("aria-sort", "none");
    await userEvent.click(
      within(nameHeader).getByRole("button", { name: "Sort by Name" }),
    );
    await expect(nameHeader).toHaveAttribute("aria-sort", "descending");
  },
});

export const ResizeColumns = meta.story({
  name: "(Test) Resizes columns",
  args: {
    data: {
      status: "success",
      data: [
        {
          createdAt: new Date("2026-09-18"),
          description: "Team analytics overview",
          name: "Dashboard",
          status: "Active",
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const header = canvas.getByRole("columnheader", { name: /Name/ });
    const resizeHandle = canvas.getByRole("button", {
      name: "Resize Name column",
    });
    const initialWidth = header.getBoundingClientRect().width;

    await userEvent.pointer([
      { keys: "[MouseLeft>]", target: resizeHandle },
      { coords: { x: initialWidth + 80, y: 0 } },
      { keys: "[/MouseLeft]" },
    ]);

    await expect(header.getBoundingClientRect().width).toBeGreaterThan(
      initialWidth,
    );
  },
});

export const Error = meta.story({
  args: {
    data: {
      status: "error",
      error: "Unable to load rows",
    },
  },
});
