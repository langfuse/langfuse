import type { ComponentProps } from "react";
import { Button } from "@/src/components/ui/button";
import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { GatewayProvidersView } from "../GatewayProvidersView";

const meta = preview.meta({ component: GatewayProvidersView });

const onCreate = fn();
const onPriorityAction = fn();
const onCredentialAction = fn();

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
} satisfies Pick<
  ComponentProps<typeof GatewayProvidersView>,
  "createAction" | "renderCredentialActions" | "renderPriorityActions"
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
