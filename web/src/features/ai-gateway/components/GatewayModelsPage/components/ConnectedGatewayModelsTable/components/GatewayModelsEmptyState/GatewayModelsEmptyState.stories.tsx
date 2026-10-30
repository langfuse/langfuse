import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayModelsEmptyState } from "./GatewayModelsEmptyState";

const meta = preview.meta({ component: GatewayModelsEmptyState });

export const Default = meta.story({
  args: {
    organizationId: "org-story",
    hasProviders: true,
    onAddProvider: fn(),
  },
});

export const ReadOnly = meta.story({
  args: { organizationId: "org-story", hasProviders: true },
});

export const NoProviders = meta.story({
  args: {
    organizationId: "org-story",
    hasProviders: false,
    onAddProvider: fn(),
  },
});

export const NoProvidersReadOnly = meta.story({
  args: { organizationId: "org-story", hasProviders: false },
});
