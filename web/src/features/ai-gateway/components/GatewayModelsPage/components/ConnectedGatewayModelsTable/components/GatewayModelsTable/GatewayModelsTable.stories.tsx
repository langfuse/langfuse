import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayModelsTable } from "./GatewayModelsTable";

const meta = preview.meta({ component: GatewayModelsTable });

const actions = {
  noResultsMessage: "No models were returned by the configured providers.",
  organizationId: "org-story",
  canManageGateway: true,
  pagination: {
    mode: "offset" as const,
    state: { pageIndex: 0, pageSize: 50 },
    totalCount: 2,
    onChange: fn(),
  },
};

export const Default = meta.story({
  args: {
    ...actions,
    data: {
      status: "success",
      data: [
        {
          id: "Primary:gpt-5-mini",
          connectionId: "primary",
          connectionName: "Primary",
          provider: "OPENAI",
          apiFormats: ["OpenAI Responses", "OpenAI Chat Completions"],
        },
        {
          id: "Anthropic production:claude-sonnet-4-5",
          connectionId: "anthropic",
          connectionName: "Anthropic production",
          provider: "ANTHROPIC",
          apiFormats: ["Anthropic Messages"],
        },
      ],
    },
  },
});

export const Loading = meta.story({
  args: { ...actions, data: { status: "loading" } },
});

export const Empty = meta.story({
  args: {
    ...actions,
    pagination: { ...actions.pagination, totalCount: 0 },
    data: { status: "success", data: [] },
  },
});
