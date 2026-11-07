import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayConfigLoadError } from "./GatewayConfigLoadError";

const meta = preview.meta({
  component: GatewayConfigLoadError,
});

export const Default = meta.story({
  args: { onRetry: fn() },
});
