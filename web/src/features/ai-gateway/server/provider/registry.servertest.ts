import { describe, expect, it, vi } from "vitest";

import {
  GatewayModelCatalogService,
  GatewayProviderService,
  getGatewayProviderDefinition,
  providerSupportsApiFormat,
} from ".";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import type { Redis } from "ioredis";
import type { OrgAuthedContext } from "@/src/server/api/trpc";

const session = {
  user: { id: "user-1" },
  orgId: "org-1",
  orgRole: "OWNER",
} as OrgAuthedContext["session"];

describe("AI gateway provider registry", () => {
  it("exposes only controlled provider URLs and explicit capabilities", () => {
    expect(getGatewayProviderDefinition("OPENAI")).toMatchObject({
      baseUrl: "https://api.openai.com/v1",
      authType: "bearer",
    });
    expect(getGatewayProviderDefinition("ANTHROPIC")).toMatchObject({
      baseUrl: "https://api.anthropic.com/v1",
      authType: "x-api-key",
      validationModel: "claude-haiku-4-5-20251001",
    });
    expect(providerSupportsApiFormat("OPENAI", "openai.responses")).toBe(true);
    expect(providerSupportsApiFormat("ANTHROPIC", "anthropic.messages")).toBe(
      true,
    );
  });

  it("validates credentials before persisting a connection", async () => {
    const validator = vi
      .fn()
      .mockRejectedValue(new Error("invalid provider credential"));
    const service = new GatewayProviderService({} as PrismaClient, validator);

    await expect(
      service.create({
        organizationId: "org-1",
        name: "Primary",
        provider: "OPENAI",
        credential: "invalid",
        session,
      }),
    ).rejects.toThrow("invalid provider credential");
    expect(validator).toHaveBeenCalledWith({
      provider: "OPENAI",
      credential: "invalid",
    });
  });

  it("reads model lists from an organization and connection scoped cache", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const redis = {
      get: vi.fn().mockResolvedValue(
        JSON.stringify([
          {
            id: "gpt-5-mini",
            provider: "OPENAI",
            canonicalSlug: "gpt-5-mini",
            displayName: "gpt-5-mini",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ]),
      ),
      setex: vi.fn(),
    } as unknown as Redis;
    const prisma = {
      gatewayAiConnection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "connection-1",
          organizationId: "org-1",
          provider: "OPENAI",
          encryptedCredential: "unused",
        }),
      },
    } as unknown as PrismaClient;
    const service = new GatewayModelCatalogService(prisma, fetcher, redis);

    await expect(
      service.refreshModels({
        organizationId: "org-1",
        connectionId: "connection-1",
      }),
    ).resolves.toEqual({
      connectionId: "connection-1",
      success: true,
      models: ["gpt-5-mini"],
    });
    expect(redis.get).toHaveBeenCalledWith(
      "ai-gateway:models:org-1:connection-1",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("collects every Anthropic model page as canonical metadata", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: "claude-a",
              display_name: "Claude A",
              created_at: "2026-01-01T00:00:00.000Z",
            },
          ],
          has_more: true,
          last_id: "claude-a",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: "claude-b",
              display_name: "Claude B",
              created_at: "2026-02-01T00:00:00.000Z",
            },
          ],
          has_more: false,
        }),
      );
    const prisma = {
      gatewayAiConnection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "connection-1",
          organizationId: "org-1",
          provider: "ANTHROPIC",
          encryptedCredential: encrypt("sk-test"),
          status: "ENABLED",
        }),
      },
    } as unknown as PrismaClient;
    const service = new GatewayModelCatalogService(prisma, fetcher, null);

    await expect(
      service.getModelCatalog({
        organizationId: "org-1",
        connectionId: "connection-1",
      }),
    ).resolves.toMatchObject({
      success: true,
      models: [
        {
          id: "claude-a",
          provider: "ANTHROPIC",
          canonicalSlug: "claude-a",
          displayName: "Claude A",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "claude-b",
          provider: "ANTHROPIC",
          canonicalSlug: "claude-b",
          displayName: "Claude B",
          createdAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    });
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("after_id=claude-a");
  });

  it("treats malformed provider model responses as failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [{}] }));
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn(),
    } as unknown as Redis;
    const prisma = {
      gatewayAiConnection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "connection-1",
          organizationId: "org-1",
          provider: "OPENAI",
          encryptedCredential: encrypt("sk-test"),
          status: "ENABLED",
        }),
      },
    } as unknown as PrismaClient;
    const service = new GatewayModelCatalogService(prisma, fetcher, redis);

    await expect(
      service.refreshModels({
        organizationId: "org-1",
        connectionId: "connection-1",
      }),
    ).resolves.toEqual({
      connectionId: "connection-1",
      success: false,
      error: "provider_error",
    });
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it("bypasses and refreshes the cache during an explicit sync", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "gpt-5", created: 10 }] }), {
        status: 200,
      }),
    );
    const redis = {
      get: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify([{ id: "stale-model", provider: "OPENAI" }]),
        ),
      setex: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
    } as unknown as Redis;
    const prisma = {
      gatewayAiConnection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "connection-1",
          organizationId: "org-1",
          provider: "OPENAI",
          encryptedCredential: encrypt("sk-test"),
          status: "ENABLED",
        }),
      },
    } as unknown as PrismaClient;
    const service = new GatewayModelCatalogService(prisma, fetcher, redis);

    await expect(
      service.refreshModels({
        organizationId: "org-1",
        connectionId: "connection-1",
        forceRefresh: true,
      }),
    ).resolves.toEqual({
      connectionId: "connection-1",
      success: true,
      models: ["gpt-5"],
    });
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith(
      "ai-gateway:models:org-1:connection-1",
    );
    expect(redis.setex).toHaveBeenCalledWith(
      "ai-gateway:models:org-1:connection-1",
      300,
      JSON.stringify([
        {
          id: "gpt-5",
          provider: "OPENAI",
          canonicalSlug: "gpt-5",
          displayName: "gpt-5",
          createdAt: "1970-01-01T00:00:10.000Z",
        },
      ]),
    );
  });
});
