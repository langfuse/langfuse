import preview from "../../../../.storybook/preview";
import { expect, within } from "storybook/test";

import { AnnotationQueueItemCountBadge } from "./AnnotationQueueItemCountBadge";

const meta = preview.meta({
  component: AnnotationQueueItemCountBadge,
});

export const Toolbar = meta.story({
  args: {
    totalCount: 3,
    layout: "toolbar",
  },
});

export const Menu = meta.story({
  args: {
    totalCount: 3,
    layout: "menu",
  },
});

export const CountIsCapped = meta.story({
  name: "(Test) Caps Queue Count",
  args: {
    totalCount: 100,
    layout: "menu",
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("99+")).toBeVisible();
  },
});
