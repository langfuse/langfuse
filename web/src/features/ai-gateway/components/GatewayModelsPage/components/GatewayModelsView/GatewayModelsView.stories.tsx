import type { ComponentProps } from "react";
import NextAdapterPages from "next-query-params/pages";
import { fn } from "storybook/test";
import { QueryParamProvider } from "use-query-params";

import preview from "@/.storybook/preview";
import { GatewayModelsView } from "./GatewayModelsView";

const meta = preview.meta({
  component: GatewayModelsView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <QueryParamProvider adapter={NextAdapterPages}>
        <Story />
      </QueryParamProvider>
    ),
  ],
});

const models = [
  {
    id: "gpt-5-mini",
    availableVia: [
      {
        connectionId: "connection-primary",
        connectionName: "Primary",
        provider: "OPENAI",
      },
      {
        connectionId: "connection-fallback",
        connectionName: "Fallback",
        provider: "OPENAI",
      },
      {
        connectionId: "connection-secondary",
        connectionName: "Secondary production",
        provider: "OPENAI",
      },
    ],
    apiFormats: [
      "OpenAI Responses",
      "OpenAI Chat Completions",
      "Anthropic Messages",
    ],
  },
  {
    id: "claude-sonnet-4-5",
    availableVia: [
      {
        connectionId: "connection-anthropic-production",
        connectionName: "Anthropic production",
        provider: "ANTHROPIC",
      },
    ],
    apiFormats: ["Anthropic Messages"],
  },
] satisfies ComponentProps<typeof GatewayModelsView>["models"];

const manyModels = Array.from({ length: 60 }, (_, index) => {
  const provider =
    index % 2 === 0 ? ("OPENAI" as const) : ("ANTHROPIC" as const);

  return {
    id: `gateway-model-${String(index + 1).padStart(3, "0")}`,
    availableVia: [
      {
        connectionId: `connection-${(index % 6) + 1}`,
        connectionName: `Credential ${(index % 6) + 1}`,
        provider,
      },
    ],
    apiFormats:
      provider === "ANTHROPIC"
        ? ["Anthropic Messages"]
        : ["OpenAI Responses", "OpenAI Chat Completions"],
  };
}) satisfies ComponentProps<typeof GatewayModelsView>["models"];

const defaultArgs = {
  models,
  failedProviderCount: 0,
  providerCount: 2,
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

export const ManyRowsWithMoreAvailable = meta.story({
  args: {
    ...defaultArgs,
    models: manyModels,
    hasMoreProviders: true,
  },
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
