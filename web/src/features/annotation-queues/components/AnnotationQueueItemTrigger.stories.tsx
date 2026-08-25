import preview from "../../../../.storybook/preview";
import { expect, within } from "storybook/test";

import { AnnotationQueueItemTrigger } from "./AnnotationQueueItemTrigger";

const meta = preview.meta({
  component: AnnotationQueueItemTrigger,
});

export const Toolbar = meta.story({
  args: {
    layout: "toolbar",
    variant: "secondary",
    size: "default",
    disabled: false,
    totalCount: 0,
  },
});

export const MenuWithCount = meta.story({
  args: {
    layout: "menu",
    variant: "secondary",
    size: "default",
    disabled: false,
    totalCount: 123,
  },
});

export const Disabled = meta.story({
  args: {
    layout: "menu",
    variant: "secondary",
    size: "default",
    disabled: true,
    totalCount: 0,
  },
});

export const CountIsCapped = meta.story({
  name: "(Test) Caps Queue Count",
  args: {
    layout: "toolbar",
    variant: "secondary",
    size: "default",
    disabled: false,
    totalCount: 100,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("99+", { exact: true }),
    ).toBeVisible();
  },
});
