import type { ComponentProps } from "react";
import { Button } from "@/src/components/ui/button";
import { expect, fn, userEvent } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayProvidersView } from "./GatewayProvidersView";

const meta = preview.meta({ component: GatewayProvidersView });

const onCreate = fn();
const onCredentialAction = fn();
const onLoadMore = fn();
const onReorder = fn(async () => true);

const connections = [
  {
    id: "connection-openai",
    name: "Primary",
    provider: "OPENAI",
    displaySecret: "sk-proj-...7d3a",
    status: "ENABLED",
    organizationId: "org-1",
    createdById: "user-1",
    routingPriority: 0,
    createdAt: new Date("2026-09-07T12:00:00.000Z"),
    updatedAt: new Date("2026-09-07T12:00:00.000Z"),
  },
  {
    id: "connection-anthropic",
    name: "Fallback",
    provider: "ANTHROPIC",
    displaySecret: "sk-ant-...91bc",
    status: "ERROR",
    organizationId: "org-1",
    createdById: "user-1",
    routingPriority: 1,
    createdAt: new Date("2026-09-07T12:00:00.000Z"),
    updatedAt: new Date("2026-09-07T12:00:00.000Z"),
  },
  {
    id: "connection-openrouter",
    name: "Open models",
    provider: "OPENROUTER",
    displaySecret: "sk-or-...42ef",
    status: "DISABLED",
    organizationId: "org-1",
    createdById: "user-1",
    routingPriority: 2,
    createdAt: new Date("2026-09-07T12:00:00.000Z"),
    updatedAt: new Date("2026-09-07T12:00:00.000Z"),
  },
] satisfies ComponentProps<typeof GatewayProvidersView>["connections"];

const actions = {
  createAction: <Button onClick={onCreate}>Add credential</Button>,
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
  canReorder: true,
  onReorder,
} satisfies Pick<
  ComponentProps<typeof GatewayProvidersView>,
  | "createAction"
  | "renderCredentialActions"
  | "hasMore"
  | "isLoadingMore"
  | "onLoadMore"
  | "canReorder"
  | "onReorder"
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

export const MovesImmediately = meta.story({
  name: "(Test) Moves Immediately",
  args: {
    connections,
    modelCounts: {},
    ...actions,
  },
  play: async ({ canvas }) => {
    onReorder.mockClear();
    await userEvent.click(
      canvas.getAllByRole("button", { name: "Move credential down" })[0]!,
    );

    const rows = canvas.getAllByRole("row").slice(1);
    await expect(rows[0]).toHaveTextContent("Fallback");
    await expect(rows[1]).toHaveTextContent("Primary");
    await expect(onReorder).toHaveBeenCalledWith(
      "connection-openai",
      "connection-anthropic",
    );
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
