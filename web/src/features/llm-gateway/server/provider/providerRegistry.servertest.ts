import { describe, expect, it, vi } from "vitest";

import {
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

describe("LLM gateway provider registry", () => {
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
    expect(getGatewayProviderDefinition("OPENROUTER")).toMatchObject({
      baseUrl: "https://openrouter.ai/api/v1",
      authType: "bearer",
    });

    expect(providerSupportsApiFormat("OPENAI", "openai.responses")).toBe(true);
    expect(
      providerSupportsApiFormat("OPENROUTER", "openai.chat-completions"),
    ).toBe(true);
    expect(providerSupportsApiFormat("OPENROUTER", "openai.responses")).toBe(
      true,
    );
    expect(providerSupportsApiFormat("ANTHROPIC", "anthropic.messages")).toBe(
      true,
    );
  });

  it("validates credentials before persisting a connection", async () => {
    const validator = vi
      .fn()
      .mockRejectedValue(new Error("invalid provider credential"));
    const service = new GatewayProviderService(
      {} as PrismaClient,
      vi.fn<typeof fetch>(),
      validator,
    );

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
      get: vi.fn().mockResolvedValue(JSON.stringify(["gpt-5-mini"])),
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
    const service = new GatewayProviderService(
      prisma,
      fetcher,
      undefined,
      redis,
    );

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
      "llm-gateway:models:org-1:connection-1",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bypasses and refreshes the cache during an explicit sync", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "gpt-5" }] }), {
        status: 200,
      }),
    );
    const redis = {
      get: vi.fn().mockResolvedValue(JSON.stringify(["stale-model"])),
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
    const service = new GatewayProviderService(
      prisma,
      fetcher,
      undefined,
      redis,
    );

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
      "llm-gateway:models:org-1:connection-1",
    );
    expect(redis.setex).toHaveBeenCalledWith(
      "llm-gateway:models:org-1:connection-1",
      300,
      JSON.stringify(["gpt-5"]),
    );
  });
});
