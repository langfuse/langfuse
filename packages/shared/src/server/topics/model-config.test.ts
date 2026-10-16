import { beforeEach, describe, expect, it, vi } from "vitest";
import { LLMAdapter } from "../llm/types";
import {
  getEnabledTopicsModels,
  prepareTopicsModelSettings,
  reconcileTopicsConnectionsForProject,
  writeTopicsModelSettings,
} from "./model-config";

const mocks = vi.hoisted(() => ({
  keys: vi.fn(),
  projects: vi.fn(),
  configs: vi.fn(),
  current: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  transaction: vi.fn(),
  invalidate: vi.fn(),
  hasEmbeddings: vi.fn(),
  generateText: vi.fn(),
  embed: vi.fn(),
}));
vi.mock("./clickhouse", () => ({ hasTopicEmbeddings: mocks.hasEmbeddings }));
vi.mock("./text", () => ({ generateTopicText: mocks.generateText }));
vi.mock("./embeddings", () => ({ generateTopicEmbeddings: mocks.embed }));
vi.mock("./processing-gate", () => ({
  invalidateTopicsProcessingActive: mocks.invalidate,
}));
vi.mock("../../db", () => {
  const tx = {
    llmApiKeys: { findMany: mocks.keys },
    project: { findMany: mocks.projects },
    topicConfig: {
      findMany: mocks.configs,
      findUnique: mocks.current,
      update: mocks.update,
      upsert: mocks.upsert,
    },
  };
  return {
    prisma: {
      ...tx,
      $transaction: (callback: (client: typeof tx) => unknown) => {
        mocks.transaction();
        return callback(tx);
      },
    },
  };
});

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
  clustering: slot("openai", "gpt-5.6-terra"),
};

const saveTopicsModelSettings = async (
  projectId: string,
  value: Parameters<typeof prepareTopicsModelSettings>[1],
) =>
  writeTopicsModelSettings(
    projectId,
    await prepareTopicsModelSettings(projectId, value),
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocks.keys.mockResolvedValue([
    connection("openai", LLMAdapter.OpenAI),
    connection("anthropic", LLMAdapter.Anthropic),
  ]);
  mocks.current.mockResolvedValue(null);
  mocks.projects.mockResolvedValue([{ id: "project", orgId: "target-org" }]);
  mocks.hasEmbeddings.mockResolvedValue(false);
  mocks.generateText.mockResolvedValue({
    output: {
      summary: "Sign in",
      status: "applicable",
      name: "Access",
      description: "Sign-in help",
    },
  });
  mocks.embed.mockImplementation(async ({ summaries, dimensions }) => ({
    embeddings: summaries.map(() => Array(dimensions).fill(0.1)),
  }));
});

describe("prepareTopicsModelSettings", () => {
  it("accepts an organization connection inherited by the project", async () => {
    mocks.keys.mockResolvedValue([
      {
        ...connection("openai", LLMAdapter.OpenAI),
        projectId: null,
        organizationId: "organization",
      },
    ]);

    await saveTopicsModelSettings("project", settings);

    expect(mocks.keys).toHaveBeenCalledWith({
      where: {
        id: { in: ["openai", "openai", "openai"] },
        OR: [
          { projectId: "project" },
          {
            organization: {
              projects: {
                some: { id: "project", deletedAt: null },
              },
            },
          },
        ],
      },
    });
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("validates text slots through the Topics transport before saving", async () => {
    await saveTopicsModelSettings("project", {
      ...settings,
      clustering: slot("anthropic", "claude-sonnet"),
    });
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ model: "claude-sonnet" }),
        maxOutputTokens: 512,
        timeoutMs: expect.any(Number),
      }),
    );
    expect(mocks.upsert).toHaveBeenCalledOnce();

    mocks.generateText.mockResolvedValueOnce({ output: { status: "invalid" } });
    await expect(
      saveTopicsModelSettings("project", {
        ...settings,
        embedding: null,
        clustering: null,
      }),
    ).rejects.toThrow("Facet summaries (gpt-6-luna)");
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("saves a partial setup only while automatic processing is off", async () => {
    await saveTopicsModelSettings("project", {
      ...settings,
      clustering: null,
    });
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.upsert.mock.calls[0][0].create).not.toHaveProperty("enabled");

    mocks.current.mockResolvedValue({ enabled: true });
    await expect(
      saveTopicsModelSettings("project", { ...settings, clustering: null }),
    ).rejects.toThrow("while automatic processing is on");
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("skips the test calls for unchanged models while automatic processing is on", async () => {
    mocks.current.mockResolvedValue({
      enabled: true,
      summaryLlmApiKeyId: "openai",
      summaryModel: "gpt-6-luna",
      embeddingLlmApiKeyId: "openai",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 1024,
      clusteringLlmApiKeyId: "openai",
      clusteringModel: "gpt-5.6-terra",
    });
    await saveTopicsModelSettings("project", {
      ...settings,
      clustering: slot("openai", "gpt-6.1-sol"),
    });
    expect(mocks.generateText).toHaveBeenCalledOnce();
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ model: "gpt-6.1-sol" }),
      }),
    );
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it("tests every changed slot and names the ones that fail", async () => {
    mocks.current.mockResolvedValue({ enabled: true });
    mocks.generateText.mockImplementation(async ({ model }) => {
      if (model.model === "gpt-5.6-terra")
        throw new Error("Model not found (HTTP 404)");
      return { output: { summary: "Sign in", status: "applicable" } };
    });
    mocks.embed.mockResolvedValue({
      embeddings: [Array(1536).fill(0.1), Array(1536).fill(0.1)],
    });

    await expect(saveTopicsModelSettings("project", settings)).rejects.toThrow(
      "Embeddings (text-embedding-3-small): The model returned 1536 dimensions instead of 1024. Choose a size this model supports.; Topic clustering (gpt-5.6-terra): Model not found (HTTP 404)",
    );
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(mocks.embed).toHaveBeenCalledWith(
      expect.objectContaining({ dimensions: 1024 }),
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
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

describe("reconcileTopicsConnectionsForProject", () => {
  it("rebinds inherited connections after a project transfer", async () => {
    const sourceConnection = {
      ...connection("source", LLMAdapter.OpenAI),
      projectId: null,
      organizationId: "source-org",
    };
    const targetConnection = {
      ...connection("target", LLMAdapter.OpenAI),
      projectId: null,
      organizationId: "target-org",
    };
    mocks.current.mockResolvedValue({
      id: "config",
      projectId: "project",
      project: { orgId: "target-org" },
      summaryLlmApiKey: sourceConnection,
      embeddingLlmApiKey: sourceConnection,
      clusteringLlmApiKey: sourceConnection,
    });
    mocks.keys.mockResolvedValue([targetConnection]);

    await reconcileTopicsConnectionsForProject("project");

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "config" },
      data: {
        summaryLlmApiKeyId: "target",
        embeddingLlmApiKeyId: "target",
        clusteringLlmApiKeyId: "target",
      },
    });
    expect(mocks.invalidate).toHaveBeenCalledWith("project");
  });

  it("pauses Topics rather than rebinding to an incompatible adapter", async () => {
    const sourceConnection = {
      ...connection("source", LLMAdapter.OpenAI),
      provider: "shared-provider",
      projectId: null,
      organizationId: "source-org",
    };
    const targetConnection = {
      ...connection("target", LLMAdapter.Anthropic),
      provider: "shared-provider",
      projectId: null,
      organizationId: "target-org",
    };
    mocks.current.mockResolvedValue({
      id: "config",
      projectId: "project",
      project: { orgId: "target-org" },
      summaryLlmApiKey: sourceConnection,
      embeddingLlmApiKey: sourceConnection,
      clusteringLlmApiKey: sourceConnection,
    });
    mocks.keys.mockImplementation(async ({ where }) =>
      where.adapter === targetConnection.adapter ? [targetConnection] : [],
    );

    await reconcileTopicsConnectionsForProject("project");

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "config" },
      data: expect.objectContaining({
        summaryLlmApiKeyId: null,
        embeddingLlmApiKeyId: null,
        clusteringLlmApiKeyId: null,
        enabled: false,
      }),
    });
  });
});

describe("getEnabledTopicsModels", () => {
  it("returns only enabled projects whose three connections are usable", async () => {
    const openai = {
      ...connection("openai", LLMAdapter.OpenAI),
      projectId: "complete",
    };
    const row = {
      projectId: "complete",
      project: { orgId: "organization" },
      enabled: true,
      summaryLlmApiKey: openai,
      summaryModel: "gpt-6-luna",
      embeddingLlmApiKey: openai,
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 512,
      clusteringLlmApiKey: openai,
      clusteringModel: "gpt-5.6-terra",
    };
    mocks.configs.mockResolvedValue([
      row,
      // A deleted connection leaves its slot empty.
      { ...row, projectId: "missing-slot", clusteringLlmApiKey: null },
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
      connection: { projectId: "complete" },
    });
  });
});
