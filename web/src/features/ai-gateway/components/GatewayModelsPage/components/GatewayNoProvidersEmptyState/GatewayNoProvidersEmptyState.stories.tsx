import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayNoProvidersEmptyState } from "./GatewayNoProvidersEmptyState";

const meta = preview.meta({ component: GatewayNoProvidersEmptyState });

export const Default = meta.story({
  args: { onAddProvider: fn() },
});

export const ReadOnly = meta.story({});
