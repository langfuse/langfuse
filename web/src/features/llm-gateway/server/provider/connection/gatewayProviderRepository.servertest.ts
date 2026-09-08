import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@langfuse/shared/src/db";

import type { OrgAuthedContext } from "@/src/server/api/trpc";
import { GatewayModelCatalogService } from "../models/gatewayModelCatalogService";
import { GatewayProviderRepository } from "./gatewayProviderRepository";
import { GatewayProviderService } from "./gatewayProviderService";

vi.mock("@/src/features/audit-logs/server", () => ({
  auditLog: vi.fn(),
}));

const session = {
  user: { id: "user-1" },
  orgId: "org-1",
  orgRole: "OWNER",
} as OrgAuthedContext["session"];

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

  it("iterates bounded pages before validating a complete reorder", async () => {
    const connections = Array.from({ length: 101 }, (_, index) =>
      connection(`connection-${index}`, index),
    );
    const findMany = vi
      .fn()
      .mockResolvedValueOnce(connections.slice(0, 101))
      .mockResolvedValueOnce(connections.slice(100))
      .mockResolvedValueOnce(connections.slice(0, 101))
      .mockResolvedValueOnce(connections.slice(100));
    const update = vi.fn().mockResolvedValue(undefined);
    const transaction = vi.fn(
      async (callback: (tx: unknown) => Promise<void>) =>
        callback({ gatewayAiConnection: { update } }),
    );
    const service = new GatewayProviderService({
      gatewayAiConnection: { findMany },
      $transaction: transaction,
    } as unknown as PrismaClient);

    await service.reorder({
      organizationId: "org-1",
      connectionIds: connections.map(({ id }) => id),
      session,
    });

    expect(findMany).toHaveBeenCalledTimes(4);
    expect(findMany.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ take: 101 }),
    );
    expect(findMany.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        cursor: { id: "connection-99" },
        skip: 1,
        take: 101,
      }),
    );
    expect(transaction).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledTimes(202);

    findMany
      .mockResolvedValueOnce(connections.slice(0, 101))
      .mockResolvedValueOnce(connections.slice(100));
    await expect(
      service.reorder({
        organizationId: "org-1",
        connectionIds: connections.slice(0, 100).map(({ id }) => id),
        session,
      }),
    ).rejects.toThrow(
      "Reorder must contain every organization gateway connection exactly once",
    );
    expect(transaction).toHaveBeenCalledOnce();
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
