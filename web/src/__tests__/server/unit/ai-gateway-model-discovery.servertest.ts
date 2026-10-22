import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import type { Redis } from "ioredis";

import { GatewayModelCatalogService } from "@/src/features/ai-gateway/server/provider/models/gatewayModelCatalogService";
import { anthropicModelDiscoveryAdapter } from "@/src/features/ai-gateway/server/provider/models/adapters/anthropic";
import { openAiModelDiscoveryAdapter } from "@/src/features/ai-gateway/server/provider/models/adapters/openAi";

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
          updatedAt: new Date(0),
        }),
      },
    } as unknown as PrismaClient;
    const service = new GatewayModelCatalogService(
      prisma,
      respondWith({ data: openAiModels }),
      redis,
    );

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
});
