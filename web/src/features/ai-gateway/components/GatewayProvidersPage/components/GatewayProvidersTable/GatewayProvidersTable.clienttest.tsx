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
  it("keeps a successful move through a stale refresh and shows absolute priorities", async () => {
    const onReorder = vi.fn(async () => true);
    const props = {
      connections,
      pageOffset: 50,
      modelCounts: {},
      getModelsUrl: (connection: GatewayConnection) =>
        `/models/${connection.id}`,
      renderCredentialActions: () => null,
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
});
