import type { ComponentProps } from "react";
import { Button } from "@/src/components/ui/button";
import { expect, fn, userEvent } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayProvidersView } from "./GatewayProvidersView";

const meta = preview.meta({ component: GatewayProvidersView });

const onCreate = fn();
const onPriorityAction = fn();
const onCredentialAction = fn();
const onLoadMore = fn();

const connections = [
  {
    id: "connection-openai",
    name: "Primary",
    provider: "OPENAI",
    displaySecret: "sk-proj-...7d3a",
    status: "ENABLED",
  },
  {
    id: "connection-anthropic",
    name: "Fallback",
    provider: "ANTHROPIC",
    displaySecret: "sk-ant-...91bc",
    status: "ERROR",
  },
  {
    id: "connection-openrouter",
    name: "Open models",
    provider: "OPENROUTER",
    displaySecret: "sk-or-...42ef",
    status: "DISABLED",
  },
] satisfies ComponentProps<typeof GatewayProvidersView>["connections"];

const actions = {
  createAction: <Button onClick={onCreate}>Add credential</Button>,
  renderPriorityActions: (connection, index) => (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => onPriorityAction(connection.id, index)}
    >
      Move
    </Button>
  ),
  renderCredentialActions: (connection) => (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => onCredentialAction(connection.id)}
    >
      Manage
    </Button>
  ),
  hasMore: false,
  isLoadingMore: false,
  onLoadMore,
} satisfies Pick<
  ComponentProps<typeof GatewayProvidersView>,
  | "createAction"
  | "renderCredentialActions"
  | "renderPriorityActions"
  | "hasMore"
  | "isLoadingMore"
  | "onLoadMore"
>;

export const OrderedCredentials = meta.story({
  args: {
    connections,
    modelCounts: {
      "connection-openai": 42,
      "connection-anthropic": 18,
      "connection-openrouter": 126,
    },
    ...actions,
  },
});

export const Empty = meta.story({
  args: {
    connections: [],
    modelCounts: {},
    ...actions,
  },
});

export const MoreAvailable = meta.story({
  args: {
    connections,
    modelCounts: {},
    ...actions,
    hasMore: true,
  },
});

export const LoadingMore = meta.story({
  args: {
    connections,
    modelCounts: {},
    ...actions,
    hasMore: true,
    isLoadingMore: true,
  },
});

export const LoadsMore = meta.story({
  name: "(Test) Loads More",
  args: {
    connections,
    modelCounts: {},
    ...actions,
    hasMore: true,
  },
  play: async ({ canvas }) => {
    onLoadMore.mockClear();
    await userEvent.click(canvas.getByRole("button", { name: "Load more" }));
    await expect(onLoadMore).toHaveBeenCalledOnce();
  },
});
