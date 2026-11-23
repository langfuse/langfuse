import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { TopicRefreshMapDialogView } from "./TopicRefreshMapDialogView";

const now = Date.parse("2026-11-18T12:00:00.000Z");

const meta = preview.meta({
  component: TopicRefreshMapDialogView,
  parameters: { layout: "fullscreen" },
  args: {
    rule: {
      name: "Halo only",
      enabled: true,
      lastRefitAt: new Date(now - 8 * 3_600_000).toISOString(),
    },
    now,
    refreshing: false,
    onRefresh: fn(),
  },
  decorators: [
    (Story) => (
      <DialogController<null>
        initialState={() => null}
        renderDialog={() => <Story />}
      >
        {() => null}
      </DialogController>
    ),
  ],
});

export const Default = meta.story({
  name: "Refresh map",
  args: { previousRefresh: { cost: 0.08, partial: true } },
});

export const Refreshing = meta.story({
  args: { refreshing: true, previousRefresh: { cost: 0, partial: false } },
});
