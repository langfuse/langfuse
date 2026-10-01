import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { DashboardTable } from "./DashboardTable";

const onEdit = fn();

const meta = preview.meta({
  component: DashboardTable,
});

export const Default = meta.story({
  args: {
    projectId: "project-1",
    hasAccess: true,
    onClone: fn(),
    onDelete: fn(),
    onEdit,
    data: {
      status: "success",
      data: [
        {
          id: "dashboard-1",
          name: "Product analytics",
          description: "Key product metrics",
          owner: "PROJECT",
          createdAt: new Date("2026-09-01"),
          updatedAt: new Date("2026-09-18"),
        },
      ],
    },
  },
});
