import { fn } from "storybook/test";

import preview from "../../.storybook/preview";
import { EnvLabelBadge } from "./EnvLabelBadge";

const meta = preview.meta({
  component: EnvLabelBadge,
});

export const Development = meta.story({
  args: {
    label: "DEV",
    variant: "development",
    onClick: fn(),
  },
});

export const Staging = meta.story({
  args: {
    label: "STAGING",
    variant: "staging",
    onClick: fn(),
  },
});

export const Production = meta.story({
  args: {
    label: "PROD-EU",
    variant: "production",
    onClick: fn(),
  },
});
