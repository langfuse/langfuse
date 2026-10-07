import { beforeEach, describe, expect, it, vi } from "vitest";
import { LLMAdapter } from "../llm/types";
import {
  getEnabledTopicsModels,
  saveTopicsModelSettings,
} from "./model-config";

const mocks = vi.hoisted(() => ({
  keys: vi.fn(),
  configs: vi.fn(),
  current: vi.fn(),
  upsert: vi.fn(),
  hasEmbeddings: vi.fn(),
}));
vi.mock("./clickhouse", () => ({ hasTopicEmbeddings: mocks.hasEmbeddings }));
vi.mock("../../db", () => ({
  prisma: {
    llmApiKeys: { findMany: mocks.keys },
    topicsModelConfig: {
      findMany: mocks.configs,
      findUnique: mocks.current,
      upsert: mocks.upsert,
    },
  },
}));

const connection = (id: string, adapter: LLMAdapter) => ({
  id,
  adapter,
  provider: `${adapter}-connection`,
  secretKey: "encrypted",
  extraHeaders: null,
  baseURL: null,
  config: null,
});
const slot = (llmApiKeyId: string, model: string) => ({ llmApiKeyId, model });
const settings = {
  summary: slot("openai", "gpt-6-luna"),
  embedding: slot("openai", "text-embedding-3-small"),
  embeddingDimensions: 1024 as const,
  naming: slot("openai", "gpt-5.6-terra"),
  enabled: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.keys.mockResolvedValue([
    connection("openai", LLMAdapter.OpenAI),
    connection("anthropic", LLMAdapter.Anthropic),
  ]);
  mocks.current.mockResolvedValue(null);
  mocks.hasEmbeddings.mockResolvedValue(false);
});

describe("saveTopicsModelSettings", () => {
  it("rejects Anthropic connections because they cannot embed", async () => {
    await expect(
      saveTopicsModelSettings("project", {
        ...settings,
        naming: slot("anthropic", "claude-sonnet"),
      }),
    ).rejects.toThrow("Anthropic has no embeddings API");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("saves a partial setup but enables Topics only with all three models", async () => {
    await saveTopicsModelSettings("project", {
      ...settings,
      naming: null,
      enabled: false,
    });
    expect(mocks.upsert).toHaveBeenCalledOnce();
    await expect(
      saveTopicsModelSettings("project", { ...settings, naming: null }),
    ).rejects.toThrow("before turning Topics on");
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it.each([
    ["model", { embedding: slot("openai", "text-embedding-3-large") }],
    ["dimensions", { embeddingDimensions: 512 as const }],
  ])(
    "locks the embedding %s once summaries are embedded",
    async (_, change) => {
      mocks.current.mockResolvedValue({
        embeddingModel: "text-embedding-3-small",
        embeddingDimensions: 1024,
      });
      mocks.hasEmbeddings.mockResolvedValue(true);
      await expect(
        saveTopicsModelSettings("project", { ...settings, ...change }),
      ).rejects.toThrow("cannot change after summaries were embedded");
      // Other slots stay editable; the embedding connection may change too.
      await saveTopicsModelSettings("project", {
        ...settings,
        summary: slot("openai", "gpt-6-luna-mini"),
      });
      expect(mocks.upsert).toHaveBeenCalledOnce();
    },
  );
});

describe("getEnabledTopicsModels", () => {
  it("returns only enabled projects whose three connections are usable", async () => {
    const openai = connection("openai", LLMAdapter.OpenAI);
    const row = {
      projectId: "complete",
      enabled: true,
      summaryLlmApiKey: openai,
      summaryModel: "gpt-6-luna",
      embeddingLlmApiKey: openai,
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 512,
      namingLlmApiKey: openai,
      namingModel: "gpt-5.6-terra",
    };
    mocks.configs.mockResolvedValue([
      row,
      // A deleted connection leaves its slot empty.
      { ...row, projectId: "missing-slot", namingLlmApiKey: null },
    ]);

    const models = await getEnabledTopicsModels(["complete", "missing-slot"]);

    expect(mocks.configs).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: { in: ["complete", "missing-slot"] },
          enabled: true,
        },
      }),
    );
    expect([...models.keys()]).toEqual(["complete"]);
    expect(models.get("complete")?.embedding).toMatchObject({
      adapter: LLMAdapter.OpenAI,
      model: "text-embedding-3-small",
      dimensions: 512,
    });
  });
});
