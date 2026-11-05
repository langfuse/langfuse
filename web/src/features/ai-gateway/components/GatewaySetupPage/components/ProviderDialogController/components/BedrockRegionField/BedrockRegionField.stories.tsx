import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { BedrockRegionField } from "./BedrockRegionField";

const meta = preview.meta({ component: BedrockRegionField });

export const Empty = meta.story({
  args: { value: "", onChange: fn() },
});

export const Selected = meta.story({
  args: { value: "eu-central-1", onChange: fn() },
});
