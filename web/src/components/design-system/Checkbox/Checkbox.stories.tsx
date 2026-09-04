import { fn } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { Checkbox } from "./Checkbox";

const meta = preview.meta({
  component: Checkbox,
  args: {
    "aria-label": "Example checkbox",
    onCheckedChange: fn(),
  },
});

export const Default = meta.story({});

export const Checked = meta.story({
  args: {
    checked: true,
  },
});

export const Disabled = meta.story({
  args: {
    checked: true,
    disabled: true,
  },
});

export const Small = meta.story({
  args: {
    size: "sm",
  },
});

export const Muted = meta.story({
  args: {
    checked: true,
    variant: "muted",
  },
});
