import { useState, type ComponentProps } from "react";
import { Button } from "@/src/components/ui/button";
import { expect, fn, userEvent } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayProvidersTable } from "./GatewayProvidersTable";
import { ConnectedGatewayProvidersTable } from "./ConnectedGatewayProvidersTable";

const meta = preview.meta({ component: GatewayProvidersTable });

const onCredentialAction = fn();
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
  routingPriority: index,
  createdAt: new Date(Date.UTC(2026, 8, 30 - index)),
  updatedAt: new Date("2026-09-30T12:00:00.000Z"),
})) satisfies ComponentProps<typeof GatewayProvidersTable>["connections"];

const manyModelCounts = Object.fromEntries(
  manyConnections.map((connection, index) => [connection.id, index * 7 + 1]),
);

const actions = {
  getModelsUrl: (connection) =>
    `/organization/org-1/settings/ai-gateway-models?connection=${connection.id}`,
  actions: (connection) => [
    {
      id: "manage",
      type: "item",
      title: "Manage",
      onClick: () => onCredentialAction(connection.id),
    },
  ],
  canReorder: true,
  pageOffset: 0,
  onMove: fn(),
} satisfies Pick<
  ComponentProps<typeof GatewayProvidersTable>,
  "getModelsUrl" | "actions" | "canReorder" | "onMove" | "pageOffset"
>;

export const OrderedCredentials = meta.story({
  args: {
    connections,
    modelCounts: {
      "connection-openai": 42,
      "connection-anthropic": 18,
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

export const MovesImmediately = meta.story({
  name: "(Test) Moves Immediately",
  args: {
    connections,
    modelCounts: {},
    ...actions,
  },
  render: (args) => (
    <ConnectedGatewayProvidersTable {...args} onReorder={onReorder} />
  ),
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

export const ResetsWhenServerOrderChanges = meta.story({
  name: "(Test) Resets When Server Order Changes",
  args: {
    connections: [
      ...connections,
      {
        ...connections[0]!,
        id: "connection-third",
        name: "Third",
        routingPriority: 2,
      },
    ],
    modelCounts: {},
    ...actions,
  },
  render: (args) => <ServerOrderExample {...args} />,
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getAllByRole("button", { name: "Move credential down" })[0]!,
    );
    await expect(canvas.getAllByRole("row")[1]).toHaveTextContent("Fallback");
    await userEvent.click(
      canvas.getByRole("button", { name: "Update server order" }),
    );
    await expect(canvas.getAllByRole("row")[1]).toHaveTextContent("Third");
    await expect(canvas.getAllByRole("row")[2]).toHaveTextContent("Fallback");
    await expect(canvas.getAllByRole("row")[3]).toHaveTextContent("Primary");
  },
});

function ServerOrderExample(
  args: ComponentProps<typeof GatewayProvidersTable>,
) {
  const [serverConnections, setServerConnections] = useState(args.connections);
  return (
    <div>
      <Button
        onClick={() => setServerConnections([...args.connections].reverse())}
      >
        Update server order
      </Button>
      <ConnectedGatewayProvidersTable
        {...args}
        connections={serverConnections}
        onReorder={async () => true}
      />
    </div>
  );
}
