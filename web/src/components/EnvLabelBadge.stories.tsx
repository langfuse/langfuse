import preview from "../../.storybook/preview";
import { EnvLabelBadge } from "./EnvLabelBadge";

const meta = preview.meta({
  component: EnvLabelBadge,
});

export const Development = meta.story({
  args: {
    region: "DEV",
  },
});

export const Staging = meta.story({
  args: {
    region: "STAGING",
  },
});

export const Production = meta.story({
  args: {
    region: "EU",
  },
});
