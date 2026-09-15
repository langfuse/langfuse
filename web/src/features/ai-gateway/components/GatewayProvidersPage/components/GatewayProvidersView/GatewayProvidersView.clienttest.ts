import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getProviderReorder } from "@/src/features/ai-gateway/fns/providerReorder/getProviderReorder";
import { reorderProviderIds } from "@/src/features/ai-gateway/fns/providerReorder/reorderProviderIds";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";
import { GatewayProvidersView } from "./GatewayProvidersView";

const connection = (
  id: string,
  name: string,
  routingPriority: number,
): GatewayConnection => ({
  id,
  name,
  provider: "OPENAI",
  displaySecret: "sk-...test",
  status: "ENABLED",
  organizationId: "org-1",
  createdById: "user-1",
  routingPriority,
  createdAt: new Date("2026-09-08T12:00:00.000Z"),
  updatedAt: new Date("2026-09-08T12:00:00.000Z"),
});

describe("provider credential reordering", () => {
  it("moves credentials in both directions", () => {
    expect(
      reorderProviderIds(["openai", "anthropic"], "openai", "anthropic"),
    ).toEqual(["anthropic", "openai"]);
    expect(
      reorderProviderIds(["anthropic", "openai"], "openai", "anthropic"),
    ).toEqual(["openai", "anthropic"]);
  });

  it("resets an optimistic order when the server order changes", async () => {
    const alpha = connection("alpha", "Alpha", 0);
    const beta = connection("beta", "Beta", 1);
    const gamma = connection("gamma", "Gamma", 2);
    const props = {
      modelCounts: {},
      getModelsUrl: (item: GatewayConnection) => `/models/${item.id}`,
      createAction: null,
      renderCredentialActions: () => null,
      hasMore: false,
      isLoadingMore: false,
      onLoadMore: vi.fn(),
      canReorder: true,
      onReorder: vi.fn(async () => true),
    };
    const { rerender } = render(
      createElement(GatewayProvidersView, {
        ...props,
        connections: [alpha, beta, gamma],
      }),
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Move credential down" })[0]!,
    );
    await waitFor(() => {
      expect(screen.getAllByRole("row")[1]).toHaveTextContent("Beta");
    });

    rerender(
      createElement(GatewayProvidersView, {
        ...props,
        connections: [gamma, beta, alpha],
      }),
    );

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Gamma");
    expect(screen.getAllByRole("row")[2]).toHaveTextContent("Beta");
    expect(screen.getAllByRole("row")[3]).toHaveTextContent("Alpha");
  });

  it("maps a completed drag to the source and target credentials", () => {
    expect(
      getProviderReorder(
        {
          active: { id: "openai" },
          over: { id: "anthropic" },
        } as Parameters<typeof getProviderReorder>[0],
        true,
      ),
    ).toEqual({ sourceId: "openai", targetId: "anthropic" });
  });

  it("ignores disabled and unchanged drags", () => {
    const drag = {
      active: { id: "openai" },
      over: { id: "openai" },
    } as Parameters<typeof getProviderReorder>[0];

    expect(getProviderReorder(drag, true)).toBeNull();
    expect(getProviderReorder(drag, false)).toBeNull();
  });
});
