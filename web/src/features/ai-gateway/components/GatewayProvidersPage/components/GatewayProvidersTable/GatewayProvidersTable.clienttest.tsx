import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";
import { ConnectedGatewayProvidersTable } from "./ConnectedGatewayProvidersTable";

const connections = ["Alpha", "Beta"].map((name, index) => ({
  id: name.toLowerCase(),
  name,
  provider: "OPENAI" as const,
  displaySecret: "sk-...test",
  status: "ENABLED" as const,
  organizationId: "org-1",
  createdById: "user-1",
  routingPriority: index,
  createdAt: new Date("2026-09-08T12:00:00.000Z"),
  updatedAt: new Date("2026-09-08T12:00:00.000Z"),
})) satisfies GatewayConnection[];

describe("gateway providers table", () => {
  it("renders priority first and exposes a table actions menu", () => {
    render(
      <ConnectedGatewayProvidersTable
        connections={connections}
        pageOffset={0}
        modelCounts={{}}
        getModelsUrl={(connection) => `/models/${connection.id}`}
        actions={() => [
          {
            id: "edit",
            type: "item",
            title: "Edit credential",
            onClick: () => {},
          },
        ]}
        canReorder
        onReorder={async () => true}
      />,
    );

    expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent(
      "Priority",
    );
    expect(
      screen.getAllByRole("button", { name: "Open actions menu" }),
    ).toHaveLength(2);
  });

  it("keeps a successful move through a stale refresh and shows absolute priorities", async () => {
    const onReorder = vi.fn(async () => true);
    const props = {
      connections,
      pageOffset: 50,
      modelCounts: {},
      getModelsUrl: (connection: GatewayConnection) =>
        `/models/${connection.id}`,
      actions: () => [],
      canReorder: true,
      onReorder,
    };
    const { rerender } = render(<ConnectedGatewayProvidersTable {...props} />);

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("51");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Move credential down" })[0]!,
    );
    await waitFor(() => expect(onReorder).toHaveBeenCalledOnce());
    rerender(
      <ConnectedGatewayProvidersTable
        {...props}
        connections={[...connections]}
      />,
    );
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Beta");
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("51");

    rerender(
      <ConnectedGatewayProvidersTable
        {...props}
        connections={[...connections].reverse()}
      />,
    );
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Beta");
  });

  it("allows a boundary credential to move to the adjacent page", async () => {
    const onReorder = vi.fn(async () => true);
    render(
      <ConnectedGatewayProvidersTable
        connections={connections}
        pageOffset={50}
        previousConnectionId="previous-page"
        nextConnectionId="next-page"
        modelCounts={{}}
        getModelsUrl={(connection) => `/models/${connection.id}`}
        actions={() => []}
        canReorder
        onReorder={onReorder}
      />,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Move credential up" })[0]!,
    );
    await waitFor(() =>
      expect(onReorder).toHaveBeenCalledWith("alpha", "previous-page"),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Move credential down" })[1]!,
    );
    await waitFor(() =>
      expect(onReorder).toHaveBeenCalledWith("beta", "next-page"),
    );
  });

  it("adopts a new server order that differs from an optimistic move", async () => {
    const gamma = { ...connections[0]!, id: "gamma", name: "Gamma" };
    const onReorder = vi.fn(async () => true);
    const props = {
      pageOffset: 0,
      modelCounts: {},
      getModelsUrl: (connection: GatewayConnection) =>
        `/models/${connection.id}`,
      actions: () => [],
      canReorder: true,
      onReorder,
    };
    const { rerender } = render(
      <ConnectedGatewayProvidersTable
        {...props}
        connections={[...connections, gamma]}
      />,
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Move credential down" })[0]!,
    );
    await waitFor(() => expect(onReorder).toHaveBeenCalledOnce());
    rerender(
      <ConnectedGatewayProvidersTable
        {...props}
        connections={[gamma, ...connections]}
      />,
    );
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Gamma");
  });
});
