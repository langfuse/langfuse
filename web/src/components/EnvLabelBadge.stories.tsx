import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../.storybook/preview";
import { EnvLabelBadge } from "./EnvLabelBadge";

const meta = preview.meta({
  component: EnvLabelBadge,
});

export const Development = meta.story({
  args: {
    region: "DEV",
    onDismiss: fn(),
  },
});

export const Staging = meta.story({
  args: {
    region: "STAGING",
    onDismiss: fn(),
  },
});

export const Production = meta.story({
  args: {
    region: "EU",
    onDismiss: fn(),
  },
});

export const TestDismissesOnClick = meta.story({
  name: "(Test) Dismisses On Click",
  args: {
    region: "EU",
    onDismiss: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: /PROD-EU/ }));

    await expect(args.onDismiss).toHaveBeenCalledTimes(1);
  },
});

// #18871: the badge was refactored onto the design-system `Badge`, which is a
// `<span>`, and lost its click handler. A `<span onClick>` would not have been
// reachable this way, which is why the fix renders a real `<button>`.
export const TestDismissesFromTheKeyboard = meta.story({
  name: "(Test) Dismisses From The Keyboard",
  args: {
    region: "STAGING",
    onDismiss: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const badge = canvas.getByRole("button", { name: /STAGING/ });

    await userEvent.tab();
    await expect(badge).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await expect(args.onDismiss).toHaveBeenCalledTimes(1);
  },
});
