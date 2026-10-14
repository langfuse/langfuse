import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { ConnectedGatewayModelsTable } from "./ConnectedGatewayModelsTable";

const meta = preview.meta({ component: ConnectedGatewayModelsTable });

export const Default = meta.story({
  args: {
    models: [
      {
        id: "gpt-5-mini",
        availableVia: [
          {
            connectionId: "openai-production",
            connectionName: "OpenAI production",
            provider: "OPENAI",
            enabled: true,
          },
        ],
        apiFormats: ["OpenAI Responses", "OpenAI Chat Completions"],
      },
      {
        id: "claude-sonnet-4-5",
        availableVia: [
          {
            connectionId: "anthropic-production",
            connectionName: "Anthropic production",
            provider: "ANTHROPIC",
            enabled: true,
          },
        ],
        apiFormats: ["Anthropic Messages"],
      },
      {
        id: "shared-model",
        availableVia: [
          {
            connectionId: "openai-production",
            connectionName: "OpenAI production",
            provider: "OPENAI",
            enabled: true,
          },
          {
            connectionId: "anthropic-production",
            connectionName: "Anthropic production",
            provider: "ANTHROPIC",
            enabled: true,
          },
        ],
        apiFormats: ["OpenAI Chat Completions", "Anthropic Messages"],
      },
    ],
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
  },
});
