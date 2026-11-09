import type { PrismaClient } from "@langfuse/shared/src/db";
import { describe, expect, it, vi } from "vitest";

import { GatewayApiKeyRepository } from "./gatewayApiKeyRepository";

function gatewayApiKey(id: string) {
  return {
    metadata: {},
    apiKey: {
      id,
      publicKey: `pk-${id}`,
      displaySecretKey: "sk-...",
      note: null,
      createdAt: new Date(0),
      expiresAt: null,
      lastUsedAt: null,
      createdByUserId: null,
    },
  };
}

describe("GatewayApiKeyRepository pagination", () => {
  it("returns the requested offset page with the organization's total count", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([gatewayApiKey("key-3"), gatewayApiKey("key-4")]);
    const count = vi.fn().mockResolvedValue(5);
    const repository = new GatewayApiKeyRepository({
      gatewayApiKeyAssociation: { findMany, count },
    } as unknown as PrismaClient);

    await expect(
      repository.listGatewayApiKeys({
        organizationId: "org-1",
        page: 1,
        limit: 2,
      }),
    ).resolves.toMatchObject({
      data: [{ apiKey: { id: "key-3" } }, { apiKey: { id: "key-4" } }],
      totalCount: 5,
    });
    const where = { apiKey: { orgId: "org-1", scope: "ORGANIZATION" } };
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ apiKey: { createdAt: "asc" } }, { apiKeyId: "asc" }],
        take: 2,
        skip: 2,
        where,
      }),
    );
    expect(count).toHaveBeenCalledWith({ where });
  });
});
