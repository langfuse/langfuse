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
      "ai-gateway:models:org-1:connection-1",
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
});
