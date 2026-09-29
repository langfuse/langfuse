import { fn } from "storybook/test";

import preview from "../../.storybook/preview";
import { EnvLabelBadge } from "./EnvLabelBadge";

const meta = preview.meta({
  component: EnvLabelBadge,
});

export const Development = meta.story({
  args: {
    region: "DEV",
    onClick: fn(),
  },
});

export const Staging = meta.story({
  args: {
    region: "STAGING",
    onClick: fn(),
  },
});

export const Production = meta.story({
  args: {
    region: "EU",
    onClick: fn(),
  },
});
