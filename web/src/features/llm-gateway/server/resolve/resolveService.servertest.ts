import type { PrismaClient } from "@langfuse/shared/src/db";
import { describe, expect, it, vi } from "vitest";

import { GatewayResolveService } from "./resolveService";

vi.mock("@langfuse/shared/encryption", () => ({
  decrypt: vi.fn(() => "sk-test"),
}));

describe("GatewayResolveService", () => {
  it("loads the complete resolve context in one database query", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      apiKeyId: "key-1",
      apiKey: {
        orgId: "org-1",
        organization: {
          gatewayConfig: {
            defaultIngestionProjectId: "project-1",
            instrumentationMode: "NONE",
            defaultIngestionProject: {
              id: "project-1",
              orgId: "org-1",
              deletedAt: null,
            },
          },
          gatewayAiConnections: [
            {
              id: "connection-1",
              provider: "OPENAI",
              encryptedCredential: "encrypted-credential",
            },
          ],
        },
      },
    });
    const service = new GatewayResolveService(
      {
        gatewayApiKeyAssociation: { findFirst },
      } as unknown as PrismaClient,
      {},
    );

    await expect(
      service.resolve({
        fastHashedSecretKey: "hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).resolves.toMatchObject({
      connection: {
        api_format: "openai.responses",
        base_url: "https://api.openai.com/v1",
      },
      ingestion: undefined,
    });

    expect(findFirst).toHaveBeenCalledOnce();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        relationLoadStrategy: "join",
        where: {
          apiKey: {
            fastHashedSecretKey: "hashed-secret-key",
            scope: "ORGANIZATION",
            orgId: { not: null },
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
        },
      }),
    );
  });

  it("rejects an unknown or expired gateway key", async () => {
    const service = new GatewayResolveService(
      {
        gatewayApiKeyAssociation: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as unknown as PrismaClient,
      {},
    );

    await expect(
      service.resolve({
        fastHashedSecretKey: "invalid-hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
