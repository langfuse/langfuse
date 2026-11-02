import type { ComponentProps } from "react";
import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { ConnectionSummary } from "./ConnectionSummary";

const meta = preview.meta({ component: ConnectionSummary });

const connection = {
  id: "connection-openai",
  name: "OpenAI production",
  provider: "OPENAI",
  displaySecret: "sk-proj-...7d3a",
  status: "ENABLED",
  organizationId: "org-1",
  createdById: "user-1",
  allowedModels: null,
  createdAt: new Date("2026-09-07T12:00:00.000Z"),
  updatedAt: new Date("2026-09-07T12:00:00.000Z"),
} satisfies NonNullable<ComponentProps<typeof ConnectionSummary>["connection"]>;

const actions = {
  isDeleting: false,
  isError: false,
  isRetrying: false,
  onDelete: fn(async () => {}),
  onRefresh: fn(),
  onRetry: fn(),
};

export const AllModels = meta.story({
  args: { ...actions, connection },
});

export const SelectedModels = meta.story({
  args: {
    ...actions,
    connection: { ...connection, allowedModels: ["gpt-4o"] },
  },
});

export const Anthropic = meta.story({
  args: {
    ...actions,
    connection: {
      ...connection,
      id: "connection-anthropic",
      name: "Anthropic production",
      provider: "ANTHROPIC",
      displaySecret: "sk-ant-...91bc",
    },
  },
});

export const Loading = meta.story({
  args: { ...actions, connection: undefined },
});

export const LoadError = meta.story({
  args: { ...actions, connection: undefined, isError: true },
});
