import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@langfuse/shared/src/db";

import { GatewayModelCatalogService } from "../models/gatewayModelCatalogService";
import { GatewayProviderRepository } from "./gatewayProviderRepository";

function connection(id: string, routingPriority: number) {
  return {
    id,
    organizationId: "org-1",
    name: id,
    provider: "OPENAI" as const,
    displaySecret: "sk-...",
    createdById: null,
    routingPriority,
    status: "ENABLED" as const,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

describe("GatewayProviderRepository pagination", () => {
  it("bounds provider pages with stable cursors", async () => {
    const connectionFindMany = vi
      .fn()
      .mockResolvedValue([
        connection("connection-1", 0),
        connection("connection-2", 1),
        connection("connection-3", 2),
      ]);
    const repository = new GatewayProviderRepository({
      gatewayAiConnection: { findMany: connectionFindMany },
    } as unknown as PrismaClient);

    await expect(
      repository.listConnections({
        organizationId: "org-1",
        limit: 2,
      }),
    ).resolves.toMatchObject({
      data: [{ id: "connection-1" }, { id: "connection-2" }],
      nextCursor: "connection-2",
    });
    expect(connectionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ routingPriority: "asc" }, { id: "asc" }],
        take: 3,
      }),
    );
  });

  it("fetches only enabled connections for model refresh", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new GatewayModelCatalogService({
      gatewayAiConnection: { findMany },
    } as unknown as PrismaClient);

    await expect(service.refreshAllModels("org-1")).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 101,
        where: {
          organizationId: "org-1",
          status: "ENABLED",
        },
      }),
    );
  });
});
