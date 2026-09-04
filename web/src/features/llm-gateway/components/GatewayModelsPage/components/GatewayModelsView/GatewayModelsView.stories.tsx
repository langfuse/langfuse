import type { ComponentProps } from "react";
import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayModelsView } from "./GatewayModelsView";

const meta = preview.meta({ component: GatewayModelsView });

const models = [
  {
    id: "gpt-5-mini",
    availableVia: [
      { connectionName: "Primary", provider: "OPENAI" },
      { connectionName: "OpenRouter fallback", provider: "OPENROUTER" },
    ],
    apiFormats: ["OpenAI Responses", "OpenAI Chat Completions"],
  },
  {
    id: "claude-sonnet-4-5",
    availableVia: [
      { connectionName: "Anthropic production", provider: "ANTHROPIC" },
    ],
    apiFormats: ["Anthropic Messages"],
  },
] satisfies ComponentProps<typeof GatewayModelsView>["models"];

const defaultArgs = {
  models,
  failedProviderCount: 0,
  providerCount: 3,
  hasProviders: true,
  hasSynced: true,
  isLoading: false,
  syncError: false,
  onSync: fn(),
  hasMoreProviders: false,
  isLoadingMoreProviders: false,
  onLoadMoreProviders: fn(),
} satisfies ComponentProps<typeof GatewayModelsView>;

export const Populated = meta.story({
  args: defaultArgs,
});

export const PartialFailure = meta.story({
  args: {
    ...defaultArgs,
    failedProviderCount: 1,
  },
});

export const Empty = meta.story({
  args: {
    ...defaultArgs,
    models: [],
  },
});

export const Loading = meta.story({
  args: {
    ...defaultArgs,
    models: [],
    hasSynced: false,
    isLoading: true,
  },
});

export const MoreProvidersAvailable = meta.story({
  args: {
    ...defaultArgs,
    hasMoreProviders: true,
  },
});
