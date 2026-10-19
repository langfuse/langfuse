import type { ComponentProps } from "react";
import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayProvidersTable } from "./GatewayProvidersTable";

const meta = preview.meta({ component: GatewayProvidersTable });

const onCredentialAction = fn();

const connections = [
  {
    id: "connection-openai",
    name: "Primary",
    provider: "OPENAI",
    displaySecret: "sk-proj-...7d3a",
    status: "ENABLED",
    organizationId: "org-1",
    createdById: "user-1",
    allowedModels: null,
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
    allowedModels: null,
    createdAt: new Date("2026-09-07T12:00:00.000Z"),
    updatedAt: new Date("2026-09-07T12:00:00.000Z"),
  },
] satisfies ComponentProps<typeof GatewayProvidersTable>["connections"];

const providers = ["OPENAI", "ANTHROPIC"] as const;
const statuses = ["ENABLED", "ERROR", "DISABLED"] as const;
const manyConnections = Array.from({ length: 30 }, (_, index) => ({
  id: `connection-${index + 1}`,
  name: `Credential ${index + 1}`,
  provider: providers[index % providers.length]!,
  displaySecret: `sk-...${String(index + 1).padStart(4, "0")}`,
  status: statuses[index % statuses.length]!,
  organizationId: "org-1",
  createdById: "user-1",
  allowedModels: null,
  createdAt: new Date(Date.UTC(2026, 8, 30 - index)),
  updatedAt: new Date("2026-09-30T12:00:00.000Z"),
})) satisfies ComponentProps<typeof GatewayProvidersTable>["connections"];

const manyModelCounts = Object.fromEntries(
  manyConnections.map((connection, index) => [
    connection.id,
    { enabled: index * 7 + 1, total: index * 7 + 1 },
  ]),
);

const actions = {
  onSelect: (connection) => onCredentialAction(connection.id),
  onRetry: (connection) => onCredentialAction(connection.id),
  onEdit: (connection) => onCredentialAction(connection.id),
  onDelete: (connection) => onCredentialAction(connection.id),
} satisfies Pick<
  ComponentProps<typeof GatewayProvidersTable>,
  "onSelect" | "onRetry" | "onEdit" | "onDelete"
>;

export const OrderedCredentials = meta.story({
  args: {
    connections,
    modelCounts: {
      "connection-openai": { enabled: 42, total: 42 },
      "connection-anthropic": { enabled: 18, total: 20 },
    },
    ...actions,
  },
});

export const ManyRows = meta.story({
  args: {
    connections: manyConnections,
    modelCounts: manyModelCounts,
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
