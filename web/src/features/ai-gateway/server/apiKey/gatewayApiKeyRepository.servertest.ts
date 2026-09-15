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
  it("bounds API key pages with stable cursors", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        gatewayApiKey("key-1"),
        gatewayApiKey("key-2"),
        gatewayApiKey("key-3"),
      ]);
    const repository = new GatewayApiKeyRepository({
      gatewayApiKeyAssociation: { findMany },
    } as unknown as PrismaClient);

    await expect(
      repository.listGatewayApiKeys({
        organizationId: "org-1",
        limit: 2,
      }),
    ).resolves.toMatchObject({
      data: [{ apiKey: { id: "key-1" } }, { apiKey: { id: "key-2" } }],
      nextCursor: "key-2",
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ apiKey: { createdAt: "asc" } }, { apiKeyId: "asc" }],
        take: 3,
        where: {
          apiKey: {
            orgId: "org-1",
            scope: "ORGANIZATION",
          },
        },
      }),
    );
  });
});
