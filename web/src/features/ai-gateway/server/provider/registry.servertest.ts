import dns from "node:dns/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as GatewayFetch from "@/src/features/ai-gateway/server/provider/getGatewayFetch";
import { getGatewayFetch } from "@/src/features/ai-gateway/server/provider/getGatewayFetch";

import { GatewayModelCatalogService } from "@/src/features/ai-gateway/server/provider/models/gatewayModelCatalogService";
import { GatewayModelsService } from "@/src/features/ai-gateway/server/provider/models/gatewayModelsService";
import type { GatewayApiKeyAuthContext } from "@/src/features/ai-gateway/server/auth/gatewayApiKeyAuthenticator";
import { GatewayProviderService } from "@/src/features/ai-gateway/server/provider/connection/gatewayProviderService";
import {
  gatewayProviders,
  getGatewayProviderDefinition,
  getGatewayUpstream,
  providerSupportsApiFormat,
} from "@/src/features/ai-gateway/server/provider/registry";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import type { Redis } from "ioredis";
import type { OrgAuthedContext } from "@/src/server/api/trpc";

const session = {
  user: { id: "user-1" },
  orgId: "org-1",
  orgRole: "OWNER",
} as OrgAuthedContext["session"];

vi.mock(
  "@/src/features/ai-gateway/server/provider/getGatewayFetch",
  async (importOriginal) => {
    const actual = await importOriginal<typeof GatewayFetch>();
    return { getGatewayFetch: vi.fn(actual.getGatewayFetch) };
  },
);

afterEach(() => {
  vi.mocked(getGatewayFetch).mockReset();
});

describe("AI gateway provider registry", () => {
  it("exposes only controlled provider URLs and explicit capabilities", () => {
    expect(getGatewayProviderDefinition("OPENAI")).toMatchObject({
      baseUrl: "https://api.openai.com/v1",
      authType: "bearer",
    });
    expect(getGatewayProviderDefinition("ANTHROPIC")).toMatchObject({
      baseUrl: "https://api.anthropic.com/v1",
      authType: "x-api-key",
      credentialCheck: { model: "claude-haiku-4-5-20251001" },
    });
    expect(providerSupportsApiFormat("OPENAI", "openai.responses")).toBe(true);
    expect(providerSupportsApiFormat("ANTHROPIC", "anthropic.messages")).toBe(
      true,
    );
  });

  it("routes Decisions only to OpenAI and Vercel", () => {
    expect(
      gatewayProviders.filter((provider) =>
        providerSupportsApiFormat(provider, "openai.decisions"),
      ),
    ).toEqual(["OPENAI", "VERCEL"]);
  });

  it("routes Embeddings to OpenAI, Azure, aggregators and Google AI Studio", () => {
    expect(
      gatewayProviders.filter((provider) =>
        providerSupportsApiFormat(provider, "openai.embeddings"),
      ),
    ).toEqual(["OPENAI", "OPENROUTER", "VERCEL", "AZURE", "GOOGLE_AI_STUDIO"]);
  });

  it("rejects xAI keys that are disabled or blocked", () => {
    const check = getGatewayProviderDefinition("XAI").credentialCheck;
    if (!("path" in check) || !check.usable) throw new Error("no xAI check");
    const key = {
      api_key_blocked: false,
      api_key_disabled: false,
      team_blocked: false,
    };
    expect(check.usable(key)).toBe(true);
    expect(check.usable({ ...key, api_key_disabled: true })).toBe(false);
    expect(check.usable({ ...key, api_key_blocked: true })).toBe(false);
    expect(check.usable({ ...key, team_blocked: true })).toBe(false);
  });

  it("routes Bedrock to the regional runtime path matching the API format", () => {
    const config = { region: "eu-central-1" };
    expect(
      getGatewayUpstream({
        provider: "BEDROCK",
        apiFormat: "anthropic.messages",
        config,
        baseURL: null,
        credential: "unused",
      }),
    ).toEqual({
      baseUrl:
        "https://bedrock-runtime.eu-central-1.amazonaws.com/anthropic/v1",
      authType: "x-api-key",
    });
    expect(
      getGatewayUpstream({
        provider: "BEDROCK",
        apiFormat: "openai.chat-completions",
        config,
        baseURL: null,
        credential: "unused",
      }),
    ).toEqual({
      baseUrl: "https://bedrock-runtime.eu-central-1.amazonaws.com/openai/v1",
      authType: "bearer",
    });
    expect(() =>
      getGatewayUpstream({
        provider: "BEDROCK",
        apiFormat: "openai.responses",
        config: { region: "evil.example/x" },
        baseURL: null,
        credential: "unused",
      }),
    ).toThrow();
  });

  it("stores the Azure resource and project and routes each format to the resource", async () => {
    const validator = vi.fn().mockRejectedValue(new Error("stop"));
    const prisma = {
      gatewayAiConnection: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    const service = new GatewayProviderService(prisma, validator);
    const create = (baseURL: string | null) =>
      service.create({
        organizationId: "org-1",
        name: "Azure",
        provider: "AZURE",
        credential: "azure-key",
        baseURL,
        session,
      });

    await expect(create(null)).rejects.toThrow("Foundry resource");
    await expect(
      create("https://contoso.openai.azure.com/openai/v1"),
    ).rejects.toThrow("Foundry resource");
    await expect(
      create("https://Contoso.services.ai.azure.com/"),
    ).rejects.toThrow("stop");
    expect(validator).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://contoso.services.ai.azure.com",
      }),
    );
    await expect(
      create("https://contoso.services.ai.azure.com/api/projects/a/b"),
    ).rejects.toThrow("Foundry resource");
    await expect(
      create("https://contoso.services.ai.azure.com/api/projects/my-project/"),
    ).rejects.toThrow("stop");
    expect(validator).toHaveBeenLastCalledWith(
      expect.objectContaining({
        baseURL:
          "https://contoso.services.ai.azure.com/api/projects/my-project",
      }),
    );

    const upstream = (apiFormat: "openai.embeddings" | "anthropic.messages") =>
      getGatewayUpstream({
        provider: "AZURE",
        apiFormat,
        config: null,
        baseURL:
          "https://contoso.services.ai.azure.com/api/projects/my-project",
        credential: "azure-key",
      });
    expect(upstream("openai.embeddings")).toEqual({
      baseUrl: "https://contoso.services.ai.azure.com/openai/v1",
      authType: "bearer",
    });
    expect(upstream("anthropic.messages")).toEqual({
      baseUrl: "https://contoso.services.ai.azure.com/anthropic/v1",
      authType: "x-api-key",
    });
  });

  it("checks an Azure key against the resource's models list", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(new Response("", { status: 502 }));
    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    const dnsSpies = [
      vi.spyOn(dns, "resolve4").mockResolvedValue(["20.0.0.1"]),
      vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("ENODATA")),
      vi
        .spyOn(dns, "lookup")
        .mockResolvedValue([{ address: "20.0.0.1", family: 4 }] as never),
    ];
    const service = new GatewayProviderService({} as PrismaClient);
    const testCredential = () =>
      service.testCredential({
        organizationId: "org-1",
        provider: "AZURE",
        credential: "azure-key",
        baseURL: "https://contoso.services.ai.azure.com/api/projects/p",
      });

    await expect(testCredential()).resolves.toBeDefined();
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://contoso.services.ai.azure.com/openai/v1/models",
    );
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("authorization"),
    ).toBe("Bearer azure-key");
    // A failing endpoint is a bad connection, not an outage.
    await expect(testCredential()).rejects.toThrow(
      "Provider connection test failed",
    );
    for (const spy of dnsSpies) spy.mockRestore();
  });

  it("validates credentials before persisting a connection", async () => {
    const validator = vi
      .fn()
      .mockRejectedValue(new Error("invalid provider credential"));
    const prisma = {
      gatewayAiConnection: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    const service = new GatewayProviderService(prisma, validator);

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
      config: null,
      baseURL: null,
      extraHeaders: null,
    });
  });

  it("lists Bedrock models only on the route family that serves them", async () => {
    const bedrockModel = (id: string) => ({
      id,
      provider: "BEDROCK",
      canonicalSlug: id,
      displayName: id,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const redis = {
      get: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify([
            bedrockModel("us.anthropic.claude-opus-4-8"),
            bedrockModel("openai.gpt-5.5"),
          ]),
        ),
      ttl: vi.fn().mockResolvedValue(300),
      setex: vi.fn(),
    } as unknown as Redis;
    const prisma = {
      gatewayAiConnection: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "connection-1", name: "bedrock", allowedModels: null },
          ]),
      },
    } as unknown as PrismaClient;
    const service = new GatewayModelsService(prisma, redis);
    const context = {
      organizationId: "org-1",
      keyAllowedModels: null,
    } as GatewayApiKeyAuthContext;

    const messages = await service.list({
      context,
      apiFormat: "anthropic.messages",
    });
    const responses = await service.list({
      context,
      apiFormat: "openai.responses",
    });

    expect(messages.data.map(({ id, provider }) => ({ id, provider }))).toEqual(
      [
        {
          id: "bedrock:us.anthropic.claude-opus-4-8",
          provider: "ANTHROPIC",
        },
      ],
    );
    expect(
      responses.data.map(({ id, provider }) => ({ id, provider })),
    ).toEqual([{ id: "bedrock:openai.gpt-5.5", provider: "OPENAI" }]);
  });

  it("lists models through the secure LLM fetch by default", async () => {
    const globalFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ data: [{ id: "gpt-5-mini" }] }));
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      ttl: vi.fn().mockResolvedValue(-2),
      setex: vi.fn(),
    } as unknown as Redis;
    const prisma = {
      gatewayAiConnection: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "connection-1", name: "proxy", allowedModels: null },
          ]),
        findFirst: vi.fn().mockResolvedValue({
          id: "connection-1",
          organizationId: "org-1",
          provider: "OPENAI",
          encryptedCredential: encrypt("sk-test"),
          baseURL: "http://169.254.169.254/v1",
          extraHeaders: null,
          status: "ENABLED",
          allowedModels: null,
          customModels: [],
          updatedAt: new Date(0),
        }),
      },
    } as unknown as PrismaClient;

    try {
      await expect(
        new GatewayModelsService(prisma, redis).list({
          context: {
            organizationId: "org-1",
            keyAllowedModels: null,
          } as GatewayApiKeyAuthContext,
          apiFormat: "openai.responses",
        }),
      ).rejects.toThrow("Gateway model discovery is temporarily unavailable");
      expect(globalFetch).not.toHaveBeenCalled();
    } finally {
      globalFetch.mockRestore();
    }
  });

  it("reads model lists from an organization and connection scoped cache and labels OpenAI embedding models", async () => {
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
          {
            id: "text-embedding-3-small",
            provider: "OPENAI",
            canonicalSlug: "text-embedding-3-small",
            displayName: "text-embedding-3-small",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ]),
      ),
      ttl: vi.fn().mockResolvedValue(300),
      setex: vi.fn(),
    } as unknown as Redis;
    const prisma = {
      gatewayAiConnection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "connection-1",
          organizationId: "org-1",
          provider: "OPENAI",
          encryptedCredential: "unused",
          allowedModels: null,
          customModels: [],
        }),
      },
    } as unknown as PrismaClient;
    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    const service = new GatewayModelCatalogService(prisma, redis);

    await expect(
      service.refreshModels({
        organizationId: "org-1",
        connectionId: "connection-1",
      }),
    ).resolves.toEqual({
      connectionId: "connection-1",
      success: true,
      models: ["gpt-5-mini", "text-embedding-3-small"],
      modelApiFormats: { "text-embedding-3-small": ["openai.embeddings"] },
    });
    expect(redis.get).toHaveBeenCalledWith(
      "ai-gateway:models:v3:org-1:connection-1",
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(prisma.gatewayAiConnection.findFirst).not.toHaveBeenCalled();
  });

  it("does not cache a background refresh that finished after its connection changed", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ data: [{ id: "old-credential-model", created: 10 }] }),
      );
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
      ttl: vi.fn().mockResolvedValue(10),
      set: vi.fn().mockResolvedValue("OK"),
      setex: vi.fn().mockResolvedValue("OK"),
    } as unknown as Redis;
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: "connection-1",
        organizationId: "org-1",
        provider: "OPENAI",
        encryptedCredential: encrypt("sk-old"),
        status: "ENABLED",
        allowedModels: null,
        customModels: [],
        updatedAt: new Date(0),
      })
      .mockResolvedValueOnce(null);
    const prisma = {
      gatewayAiConnection: { findFirst },
    } as unknown as PrismaClient;
    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    const service = new GatewayModelCatalogService(prisma, redis);

    await service.refreshModels({
      organizationId: "org-1",
      connectionId: "connection-1",
    });

    await vi.waitFor(() => expect(findFirst).toHaveBeenCalledTimes(2));
    expect(findFirst).toHaveBeenLastCalledWith({
      where: {
        organizationId: "org-1",
        id: "connection-1",
        updatedAt: new Date(0),
      },
      select: { id: true },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it("serves a nearly expired model list while refreshing it once in the background", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ data: [{ id: "gpt-5", created: 10 }] }),
      );
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
      ttl: vi.fn().mockResolvedValue(10),
      set: vi.fn().mockResolvedValueOnce("OK").mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    } as unknown as Redis;
    const prisma = {
      gatewayAiConnection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "connection-1",
          organizationId: "org-1",
          provider: "OPENAI",
          encryptedCredential: encrypt("sk-test"),
          status: "ENABLED",
          allowedModels: null,
          customModels: [],
        }),
      },
    } as unknown as PrismaClient;
    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    const service = new GatewayModelCatalogService(prisma, redis);
    const request = {
      organizationId: "org-1",
      connectionId: "connection-1",
    };

    await expect(
      Promise.all([
        service.refreshModels(request),
        service.refreshModels(request),
      ]),
    ).resolves.toEqual([
      { connectionId: "connection-1", success: true, models: ["gpt-5-mini"] },
      { connectionId: "connection-1", success: true, models: ["gpt-5-mini"] },
    ]);
    await vi.waitFor(() =>
      expect(redis.setex).toHaveBeenCalledWith(
        "ai-gateway:models:v3:org-1:connection-1",
        300,
        expect.stringContaining('"id":"gpt-5"'),
      ),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
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
          allowedModels: null,
          customModels: [],
        }),
      },
    } as unknown as PrismaClient;
    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    const service = new GatewayModelCatalogService(prisma, null);

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

  it("lists the deployments of the connection's Azure project", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        value: [
          {
            name: "chat",
            type: "ModelDeployment",
            modelName: "gpt-5-mini",
            modelPublisher: "OpenAI",
            capabilities: { chat_completion: "true" },
          },
          {
            name: "embed",
            type: "ModelDeployment",
            modelName: "text-embedding-3-small",
            modelPublisher: "OpenAI",
            capabilities: { embeddings: "true" },
          },
          {
            name: "claude",
            type: "ModelDeployment",
            modelName: "claude-sonnet-4-5",
            modelPublisher: "Anthropic",
          },
          { name: "agent", type: "AgentDeployment" },
          {
            name: "connected",
            type: "ModelDeployment",
            modelName: "gpt-5",
            connectionName: "other-resource",
          },
        ],
      }),
    );
    const prisma = {
      gatewayAiConnection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "connection-1",
          organizationId: "org-1",
          provider: "AZURE",
          baseURL:
            "https://contoso.services.ai.azure.com/api/projects/my-project",
          encryptedCredential: encrypt("azure-key"),
          status: "ENABLED",
          allowedModels: null,
          customModels: [],
        }),
      },
    } as unknown as PrismaClient;
    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);

    await expect(
      new GatewayModelCatalogService(prisma, null).getModelCatalog({
        organizationId: "org-1",
        connectionId: "connection-1",
      }),
    ).resolves.toMatchObject({
      success: true,
      models: [
        {
          id: "chat",
          canonicalSlug: "gpt-5-mini",
          apiFormats: ["openai.responses", "openai.chat-completions"],
        },
        { id: "embed", apiFormats: ["openai.embeddings"] },
        { id: "claude", apiFormats: ["anthropic.messages"] },
      ],
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://contoso.services.ai.azure.com/api/projects/my-project/deployments?api-version=v1",
    );
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      "api-key": "azure-key",
    });
  });

  it("keeps Azure custom models when the default project can't be listed", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 404 }));
    const prisma = {
      gatewayAiConnection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "connection-1",
          organizationId: "org-1",
          provider: "AZURE",
          baseURL: "https://contoso.services.ai.azure.com",
          encryptedCredential: encrypt("azure-key"),
          status: "ENABLED",
          allowedModels: null,
          customModels: [{ id: "my-deployment" }],
        }),
      },
    } as unknown as PrismaClient;
    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);

    await expect(
      new GatewayModelCatalogService(prisma, null).getModelCatalog({
        organizationId: "org-1",
        connectionId: "connection-1",
      }),
    ).resolves.toMatchObject({
      success: true,
      modelListingDenied: true,
      models: [{ id: "my-deployment" }],
    });
  });

  it("reports a revoked Azure key instead of a denied listing", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const prisma = {
      gatewayAiConnection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "connection-1",
          organizationId: "org-1",
          provider: "AZURE",
          baseURL: "https://contoso.services.ai.azure.com",
          encryptedCredential: encrypt("azure-key"),
          status: "ENABLED",
          allowedModels: null,
          customModels: [],
        }),
      },
    } as unknown as PrismaClient;
    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);

    await expect(
      new GatewayModelCatalogService(prisma, null).getModelCatalog({
        organizationId: "org-1",
        connectionId: "connection-1",
      }),
    ).resolves.toMatchObject({ success: false, error: "unauthorized" });
    expect(String(fetcher.mock.calls[1]?.[0])).toBe(
      "https://contoso.services.ai.azure.com/openai/v1/models",
    );
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
          allowedModels: null,
          customModels: [],
        }),
      },
    } as unknown as PrismaClient;
    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    const service = new GatewayModelCatalogService(prisma, redis);

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
          allowedModels: null,
          customModels: [],
        }),
      },
    } as unknown as PrismaClient;
    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    const service = new GatewayModelCatalogService(prisma, redis);

    await expect(
      service.refreshModels({
        organizationId: "org-1",
        connectionId: "connection-1",
        forceRefresh: true,
      }),
    ).resolves.toEqual({
      connectionId: "connection-1",
      success: true,
      models: ["gpt-5", "codex-auto-review"],
    });
    expect(redis.get).not.toHaveBeenCalled();
    expect(vi.mocked(redis.del).mock.calls.flat(2)).toEqual([
      "ai-gateway:models:v3:org-1:connection-1",
      "ai-gateway:models:v2:org-1:connection-1",
      "ai-gateway:models:org-1:connection-1",
    ]);
    expect(redis.setex).toHaveBeenCalledWith(
      "ai-gateway:models:v3:org-1:connection-1",
      300,
      JSON.stringify({
        models: [
          {
            id: "gpt-5",
            provider: "OPENAI",
            canonicalSlug: "gpt-5",
            displayName: "gpt-5",
            createdAt: "1970-01-01T00:00:10.000Z",
          },
          {
            id: "codex-auto-review",
            provider: "OPENAI",
            canonicalSlug: "codex-auto-review",
            displayName: "codex-auto-review",
            createdAt: "1970-01-01T00:00:00.000Z",
          },
        ],
      }),
    );
  });

  it("adds connection custom models without duplicating ones the provider already lists", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          { id: "codex-auto-review", created: 10 },
          { id: "gpt-5", created: 10 },
        ],
      }),
    );
    const prisma = {
      gatewayAiConnection: {
        findFirst: vi.fn().mockResolvedValue({
          id: "connection-1",
          organizationId: "org-1",
          provider: "OPENAI",
          encryptedCredential: encrypt("sk-test"),
          status: "ENABLED",
          allowedModels: null,
          customModels: [{ id: "gpt-5" }, { id: "ft:gpt-4o:acme::abc" }],
        }),
      },
    } as unknown as PrismaClient;
    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    const service = new GatewayModelCatalogService(prisma, null);

    await expect(
      service.refreshModels({
        organizationId: "org-1",
        connectionId: "connection-1",
      }),
    ).resolves.toMatchObject({
      models: ["codex-auto-review", "gpt-5", "ft:gpt-4o:acme::abc"],
    });
  });
});
