import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayModelsTable } from "./GatewayModelsTable";

const meta = preview.meta({ component: GatewayModelsTable });

const actions = {
  noResultsMessage: "No models were returned by the configured providers.",
  pagination: {
    mode: "cursor" as const,
    state: { pageIndex: 0, pageSize: 10 },
    hasNextPage: true,
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
          id: "gpt-5-mini",
          availableVia: [
            {
              connectionId: "primary",
              connectionName: "Primary",
              provider: "OPENAI",
            },
            {
              connectionId: "fallback",
              connectionName: "Fallback",
              provider: "OPENAI",
            },
          ],
          apiFormats: ["OpenAI Responses", "OpenAI Chat Completions"],
        },
        {
          id: "claude-sonnet-4-5",
          availableVia: [
            {
              connectionId: "anthropic",
              connectionName: "Anthropic production",
              provider: "ANTHROPIC",
            },
          ],
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
    pagination: { ...actions.pagination, hasNextPage: false },
    data: { status: "success", data: [] },
  },
});
