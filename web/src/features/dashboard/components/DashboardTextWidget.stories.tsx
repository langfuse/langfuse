import { fn } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { DashboardTextWidget } from "./DashboardTextWidget";

const meta = preview.meta({ component: DashboardTextWidget });

export const Default = meta.story({
  args: {
    placement: {
      type: "text",
      id: "text-tile",
      title: "Reading this dashboard",
      content:
        "Compare the daily count with the error rate.\nEmpty days have no traffic.",
      x: 0,
      y: 0,
      x_size: 12,
      y_size: 2,
    },
    onEdit: fn(),
    onDelete: fn(),
  },
});
