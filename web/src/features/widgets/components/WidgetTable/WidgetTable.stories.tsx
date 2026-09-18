import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { DashboardWidgetTable } from "./WidgetTable";

const onCopy = fn();

const meta = preview.meta({
  component: DashboardWidgetTable,
});

export const Default = meta.story({
  args: {
    projectId: "project-1",
    hasCUDAccess: true,
    onCopy,
    onDelete: fn(),
    onDownload: fn(),
    onDuplicate: fn(),
    data: {
      status: "success",
      data: [
        {
          id: "widget-1",
          name: "Trace count",
          description: "Daily trace volume",
          view: "TRACES",
          chartType: "LINE_TIME_SERIES",
          owner: "PROJECT",
          createdAt: new Date("2026-09-01"),
          updatedAt: new Date("2026-09-18"),
        },
      ],
    },
  },
});
