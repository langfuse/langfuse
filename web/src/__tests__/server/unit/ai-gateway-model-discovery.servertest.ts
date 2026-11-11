import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import type { Redis } from "ioredis";

import { GatewayModelCatalogService } from "@/src/features/ai-gateway/server/provider/models/gatewayModelCatalogService";
import { getGatewayFetch } from "@/src/features/ai-gateway/server/provider/getGatewayFetch";
import { __test as gatewayModelsService } from "@/src/features/ai-gateway/server/provider/models/gatewayModelsService";
import { anthropicModelDiscoveryAdapter } from "@/src/features/ai-gateway/server/provider/models/adapters/anthropic";
import { bedrockModelDiscoveryAdapter } from "@/src/features/ai-gateway/server/provider/models/adapters/bedrock";
import { openAiModelDiscoveryAdapter } from "@/src/features/ai-gateway/server/provider/models/adapters/openAi";
import { openRouterModelDiscoveryAdapter } from "@/src/features/ai-gateway/server/provider/models/adapters/openRouter";
import { GatewayProviderService } from "@/src/features/ai-gateway/server/provider/connection/gatewayProviderService";
import { vercelModelDiscoveryAdapter } from "@/src/features/ai-gateway/server/provider/models/adapters/vercel";
import { xaiModelDiscoveryAdapter } from "@/src/features/ai-gateway/server/provider/models/adapters/xai";

vi.mock("@/src/features/ai-gateway/server/provider/getGatewayFetch", () => ({
  getGatewayFetch: vi.fn(),
}));

const openAiModels = [
  { id: "gpt-5-chat-latest", created: 1, shutdown_date: "2026-07-23" },
  { id: "tts-1-hd", created: 1, shutdown_date: "2027-01-06" },
  { id: "gpt-5.2-pro", created: 1, shutdown_date: null },
  { id: "gpt-4o-mini", created: 1 },
  { id: "unparsable-shutdown", created: 1, shutdown_date: "soon" },
  { id: "non-string-shutdown", created: 1, shutdown_date: 20260101 },
];

const respondWith = (body: unknown) => async () => Response.json(body);

const fetchOpenAiModelIds = async () => {
  const result = await openAiModelDiscoveryAdapter.fetchCatalog({
    credential: "sk-test",
    config: null,
    baseURL: null,
    extraHeaders: {},
    fetcher: respondWith({ data: openAiModels }),
  });
  return result.success ? result.models.map(({ id }) => id) : result.error;
};

describe("AI Gateway model discovery", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops OpenAI models whose shutdown date has passed", async () => {
    expect(await fetchOpenAiModelIds()).toEqual([
      "tts-1-hd",
      "gpt-5.2-pro",
      "gpt-4o-mini",
      "unparsable-shutdown",
      "non-string-shutdown",
    ]);
  });

  it("drops an OpenAI model at the start of its shutdown day", async () => {
    vi.setSystemTime(new Date("2027-01-06T00:00:00.000Z"));

    expect(await fetchOpenAiModelIds()).not.toContain("tts-1-hd");
  });

  it("caches an OpenAI catalog no longer than until its next shutdown", async () => {
    vi.setSystemTime(new Date("2027-01-05T23:58:00Z"));
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      ttl: vi.fn().mockResolvedValue(-2),
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
          updatedAt: new Date(0),
        }),
      },
    } as unknown as PrismaClient;
    vi.mocked(getGatewayFetch).mockReturnValue(
      respondWith({ data: openAiModels }),
    );
    const service = new GatewayModelCatalogService(prisma, redis);

    await service.getModelCatalog({
      organizationId: "org-1",
      connectionId: "connection-1",
    });

    expect(redis.setex).toHaveBeenCalledWith(
      "ai-gateway:models:v2:org-1:connection-1",
      120,
      expect.any(String),
    );
  });

  it("drops retired Anthropic models and keeps deprecated ones", async () => {
    const result = await anthropicModelDiscoveryAdapter.fetchCatalog({
      credential: "sk-ant-test",
      config: null,
      baseURL: null,
      extraHeaders: {},
      fetcher: respondWith({
        data: [
          {
            id: "claude-active",
            display_name: "Claude Active",
            created_at: "2026-01-01T00:00:00Z",
            lifecycle: "active",
          },
          {
            id: "claude-deprecated",
            display_name: "Claude Deprecated",
            created_at: "2025-01-01T00:00:00Z",
            lifecycle: "deprecated",
          },
          {
            id: "claude-retired",
            display_name: "Claude Retired",
            created_at: "2024-01-01T00:00:00Z",
            lifecycle: "retired",
          },
          {
            id: "claude-no-lifecycle",
            display_name: "Claude No Lifecycle",
            created_at: "2024-01-01T00:00:00Z",
          },
        ],
        has_more: false,
      }),
    });

    expect(result.success && result.models.map(({ id }) => id)).toEqual([
      "claude-active",
      "claude-deprecated",
      "claude-no-lifecycle",
    ]);
  });

  it("lists active, servable Bedrock foundation models and active inference profiles in the connection's region", async () => {
    const requestedUrls: string[] = [];
    const result = await bedrockModelDiscoveryAdapter.fetchCatalog({
      credential: JSON.stringify({ apiKey: "bedrock-test" }),
      config: { region: "eu-central-1" },
      baseURL: null,
      extraHeaders: {},
      fetcher: async (input) => {
        const url = new URL(String(input));
        requestedUrls.push(url.origin + url.pathname);
        return Response.json(
          url.pathname === "/foundation-models"
            ? {
                modelSummaries: [
                  {
                    modelId: "anthropic.claude-v1:0",
                    modelLifecycle: { status: "ACTIVE" },
                  },
                  { modelId: "amazon.nova-lite-v1:0" },
                  {
                    modelId: "anthropic.claude-v2:1",
                    modelLifecycle: { status: "LEGACY" },
                  },
                ],
              }
            : {
                inferenceProfileSummaries: [
                  { inferenceProfileId: "eu.openai.gpt-5", status: "ACTIVE" },
                  {
                    inferenceProfileId: "eu.amazon.nova-2-lite-v1:0",
                    status: "ACTIVE",
                  },
                  { inferenceProfileId: "eu.legacy", status: "INACTIVE" },
                ],
              },
        );
      },
    });

    expect(result.success && result.models.map(({ id }) => id)).toEqual([
      "anthropic.claude-v1:0",
      "eu.openai.gpt-5",
    ]);
    expect(requestedUrls).toEqual([
      "https://bedrock.eu-central-1.amazonaws.com/foundation-models",
      "https://bedrock.eu-central-1.amazonaws.com/inference-profiles",
    ]);
  });

  it("keeps Bedrock models it may list when another list is denied, and rejects other denials", async () => {
    const iamDenial = Response.json(
      {
        message:
          "User: arn:aws:iam::123456789012:user/gateway is not authorized to perform: bedrock:ListInferenceProfiles",
      },
      {
        status: 403,
        headers: { "x-amzn-ErrorType": "AccessDeniedException:http://aws/" },
      },
    );
    const fetchCatalog = (profilesResponse: Response) =>
      bedrockModelDiscoveryAdapter.fetchCatalog({
        credential: JSON.stringify({ apiKey: "bedrock-test" }),
        config: { region: "eu-central-1" },
        baseURL: null,
        extraHeaders: {},
        fetcher: async (input) =>
          new URL(String(input)).pathname === "/foundation-models"
            ? Response.json({
                modelSummaries: [{ modelId: "anthropic.claude-v1:0" }],
              })
            : profilesResponse,
      });

    const denied = await fetchCatalog(iamDenial);
    expect(denied.success && denied.models.map(({ id }) => id)).toEqual([
      "anthropic.claude-v1:0",
    ]);
    expect(denied.success && denied.modelListingDenied).toBe(true);
    await expect(
      fetchCatalog(
        Response.json(
          { __type: "AccessDeniedException", message: "Invalid API Key" },
          { status: 403 },
        ),
      ),
    ).resolves.toEqual({ success: false, error: "unauthorized" });
    await expect(
      fetchCatalog(
        Response.json(
          {
            message:
              "User: arn:aws:iam::123456789012:user/gateway is not authorized to perform: bedrock:CallWithBearerToken",
          },
          {
            status: 403,
            headers: {
              "x-amzn-ErrorType": "AccessDeniedException:http://aws/",
            },
          },
        ),
      ),
    ).resolves.toEqual({ success: false, error: "unauthorized" });
  });

  it("lists Bedrock models under every OpenAI route they serve and Claude only under Messages", () => {
    const listedIds = (apiFormat: "openai.responses" | "anthropic.messages") =>
      [
        "openai.gpt-oss-120b-1:0",
        "eu.openai.gpt-5.5",
        "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
      ].filter((id) =>
        gatewayModelsService.modelMatchesApiFormat(
          {
            id,
            provider: "BEDROCK",
            canonicalSlug: id,
            displayName: id,
            createdAt: new Date(0).toISOString(),
          },
          apiFormat,
        ),
      );

    expect(listedIds("openai.responses")).toEqual([
      "openai.gpt-oss-120b-1:0",
      "eu.openai.gpt-5.5",
    ]);
    expect(listedIds("anthropic.messages")).toEqual([
      "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    ]);
  });

  it("lists only unexpired OpenRouter models that serve every gateway route", async () => {
    const allRoutes = [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses",
    ];
    const model = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      name: id,
      created: 1,
      endpoints: allRoutes,
      ...extra,
    });
    const result = await openRouterModelDiscoveryAdapter.fetchCatalog({
      credential: "sk-or-test",
      config: null,
      baseURL: null,
      extraHeaders: {},
      fetcher: respondWith({
        data: [
          model("openai/gpt-5", { expiration_date: null }),
          model("retiring/soon", { expiration_date: "2026-11-18" }),
          model("unparsable/expiry", { expiration_date: "soon" }),
          model("expired/model", { expiration_date: "2026-11-03" }),
          model("batch/only", { endpoints: ["/api/v1/batches"] }),
          model("no/endpoints", { endpoints: undefined }),
        ],
      }),
    });

    expect(result.success && result.models.map(({ id }) => id)).toEqual([
      "openai/gpt-5",
      "retiring/soon",
      "unparsable/expiry",
    ]);
    expect(result.success && result.models[0]).toEqual({
      id: "openai/gpt-5",
      provider: "OPENROUTER",
      canonicalSlug: "openai/gpt-5",
      displayName: "openai/gpt-5",
      createdAt: new Date(1000).toISOString(),
    });
    // The catalog is refetched once the next listed model expires.
    expect(result.success && result.expiresAt).toBe(
      Date.parse("2026-11-18T00:00:00Z"),
    );
  });

  it("lists the xAI language models the key can use", async () => {
    const fetcher = vi.fn<typeof fetch>(
      respondWith({
        models: [
          { id: "grok-4.7", created: 1, aliases: ["grok-latest"] },
          { id: "grok-4.20-0309-non-reasoning", created: 2 },
        ],
      }),
    );
    const result = await xaiModelDiscoveryAdapter.fetchCatalog({
      credential: "xai-test",
      config: null,
      baseURL: null,
      extraHeaders: {},
      fetcher,
    });

    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://api.x.ai/v1/language-models",
    );
    expect(result.success && result.models).toEqual([
      {
        id: "grok-4.7",
        provider: "XAI",
        canonicalSlug: "grok-4.7",
        displayName: "grok-4.7",
        createdAt: new Date(1000).toISOString(),
      },
      {
        id: "grok-latest",
        provider: "XAI",
        canonicalSlug: "grok-4.7",
        displayName: "grok-latest",
        createdAt: new Date(1000).toISOString(),
      },
      {
        id: "grok-4.20-0309-non-reasoning",
        provider: "XAI",
        canonicalSlug: "grok-4.20-0309-non-reasoning",
        displayName: "grok-4.20-0309-non-reasoning",
        createdAt: new Date(2000).toISOString(),
      },
    ]);
  });

  it("treats xAI's 400 for a bad key as unauthorized", async () => {
    const result = await xaiModelDiscoveryAdapter.fetchCatalog({
      credential: "xai-revoked",
      config: null,
      baseURL: null,
      extraHeaders: {},
      fetcher: async () =>
        Response.json(
          { code: "invalid-argument", error: "Incorrect API key provided." },
          { status: 400 },
        ),
    });

    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("keeps an xAI key whose ACLs deny listing models", async () => {
    const result = await xaiModelDiscoveryAdapter.fetchCatalog({
      credential: "xai-inference-only",
      config: null,
      baseURL: null,
      extraHeaders: {},
      fetcher: async () =>
        Response.json(
          { code: "permission-denied", error: "Endpoint not allowed." },
          { status: 403 },
        ),
    });

    expect(result).toEqual({
      success: true,
      models: [],
      modelListingDenied: true,
    });
  });

  it("lists the Vercel language and decision models that are not deprecated or ineligible for the team", async () => {
    const model = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      object: "model",
      name: `Name of ${id}`,
      type: "language",
      created: 1755815280,
      released: 2,
      deprecated_at: null,
      ...extra,
    });
    const fetcher = vi.fn<typeof fetch>(
      respondWith({
        object: "list",
        data: [
          model("anthropic/claude-sonnet-5", {
            model_eligibility: { status: "eligible" },
          }),
          model("unevaluated/model", {
            model_eligibility: { status: "unknown" },
          }),
          model("blocked/by-allowlist", {
            model_eligibility: { status: "ineligible" },
          }),
          { id: "team/virtual-model", type: "language" },
          model("retiring/soon", {
            deprecated_at: Date.parse("2026-11-18T00:00:00Z"),
          }),
          model("unparsable/deprecation", { deprecated_at: "soon" }),
          model("deprecated/model", {
            deprecated_at: Date.parse("2026-11-01T00:00:00Z"),
          }),
          model("openai/text-embedding-3-small", { type: "embedding" }),
          model("openai/gpt-6-luna-decisions", { type: "evaluation" }),
          model("typesafe-ai/jev", { type: "decision" }),
        ],
      }),
    );
    const result = await vercelModelDiscoveryAdapter.fetchCatalog({
      credential: "vck-test",
      config: null,
      baseURL: null,
      extraHeaders: {},
      fetcher,
    });

    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://ai-gateway.vercel.sh/v1/models?include_availability",
    );
    expect(result.success && result.models.map(({ id }) => id)).toEqual([
      "anthropic/claude-sonnet-5",
      "unevaluated/model",
      "retiring/soon",
      "unparsable/deprecation",
      "openai/gpt-6-luna-decisions",
      "typesafe-ai/jev",
    ]);
    expect(result.success && result.models[0]).toEqual({
      id: "anthropic/claude-sonnet-5",
      provider: "VERCEL",
      canonicalSlug: "anthropic/claude-sonnet-5",
      displayName: "Name of anthropic/claude-sonnet-5",
      createdAt: new Date(2000).toISOString(),
      apiFormats: [
        "openai.responses",
        "openai.chat-completions",
        "anthropic.messages",
      ],
    });
    expect(
      result.success && result.models.slice(-2).map((m) => m.apiFormats),
    ).toEqual([["openai.decisions"], ["openai.decisions"]]);
    expect(result.success && result.expiresAt).toBe(
      Date.parse("2026-11-18T00:00:00Z"),
    );
  });
});

describe("AI Gateway path credential check", () => {
  const testKey = (fetcher: typeof fetch) => {
    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    return new GatewayProviderService({} as PrismaClient).testCredential({
      organizationId: "org",
      provider: "OPENROUTER",
      credential: "sk-or-test",
    });
  };

  it.each([
    [400, 400],
    [401, 400],
    [429, 503],
    [500, 503],
  ])("maps a %i from the provider to %i", async (status, httpCode) => {
    await expect(
      testKey(async () => new Response(null, { status })),
    ).rejects.toMatchObject({ httpCode });
  });

  it("treats an unreachable provider as retryable", async () => {
    await expect(
      testKey(async () => {
        throw new Error("ECONNRESET");
      }),
    ).rejects.toMatchObject({ httpCode: 503 });
  });

  it("accepts a key the provider answers with 200", async () => {
    await expect(testKey(async () => Response.json({}))).resolves.toEqual({
      modelListingDenied: false,
    });
  });
});
