import preview from "@/.storybook/preview";
import { ConnectedGatewayModelsTable } from "./ConnectedGatewayModelsTable";

const meta = preview.meta({ component: ConnectedGatewayModelsTable });

export const Default = meta.story({
  args: {
    models: [
      {
        id: "OpenAI production:gpt-5-mini",
        connectionId: "openai-production",
        connectionName: "OpenAI production",
        provider: "OPENAI",
        apiFormats: ["OpenAI Responses", "OpenAI Chat Completions"],
      },
      {
        id: "Anthropic production:claude-sonnet-4-5",
        connectionId: "anthropic-production",
        connectionName: "Anthropic production",
        provider: "ANTHROPIC",
        apiFormats: ["Anthropic Messages"],
      },
      {
        id: "OpenAI production:shared-model",
        connectionId: "openai-production",
        connectionName: "OpenAI production",
        provider: "OPENAI",
        apiFormats: ["OpenAI Chat Completions"],
      },
    ],
    organizationId: "org-story",
    canManageGateway: true,
    failedProviderCount: 0,
    providerCount: 2,
    hasProviders: true,
    hasSynced: true,
    isLoading: false,
    syncError: false,
  },
});
