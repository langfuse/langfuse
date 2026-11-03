import { fn } from "storybook/test";
import preview from "../../../../../../.storybook/preview";
import { SpendAlertsTable } from "./SpendAlertsTable";

const meta = preview.meta({ component: SpendAlertsTable });

export const Default = meta.story({
  args: {
    data: {
      status: "success",
      data: [
        {
          id: "alert-1",
          title: "Monthly budget",
          threshold: 100,
          triggeredAt: null,
        },
        {
          id: "alert-2",
          title: "Budget warning",
          threshold: 50,
          triggeredAt: new Date("2026-09-01T12:00:00Z"),
        },
      ],
    },
    onEdit: fn(),
    onDelete: fn(),
  },
});

export const Empty = meta.story({
  args: { ...Default.input.args, data: { status: "success", data: [] } },
});

export const Loading = meta.story({
  args: { ...Default.input.args, data: { status: "loading" } },
});

export const Error = meta.story({
  args: {
    ...Default.input.args,
    data: { status: "error", error: "Unable to load spend alerts." },
  },
});
