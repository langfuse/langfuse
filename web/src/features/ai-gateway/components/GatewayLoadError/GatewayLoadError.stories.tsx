import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayLoadError } from "./GatewayLoadError";

const meta = preview.meta({
  component: GatewayLoadError,
  args: { onRetry: fn() },
});

export const Setup = meta.story({
  args: { kind: "setup" },
});

export const Providers = meta.story({
  args: { kind: "providers" },
});
