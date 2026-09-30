import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { TraceliftNotificationButton } from "./TraceliftNotificationButton";

const meta = preview.meta({ component: TraceliftNotificationButton });

export const Default = meta.story({ args: { onClick: fn() } });

export const OpenImprovements = meta.story({
  name: "(Test) Open Improvements",
  args: { onClick: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
});
