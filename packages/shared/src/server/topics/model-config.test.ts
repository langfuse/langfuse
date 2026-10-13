import { beforeEach, describe, expect, it, vi } from "vitest";
import { LLMAdapter } from "../llm/types";
import {
  getEnabledTopicsModels,
  prepareTopicsModelSettings,
  writeTopicsModelSettings,
} from "./model-config";

const mocks = vi.hoisted(() => ({
  effective: vi.fn(),
  configs: vi.fn(),
  current: vi.fn(),
  upsert: vi.fn(),
  pause: vi.fn(),
  invalidate: vi.fn(),
  hasEmbeddings: vi.fn(),
  testCall: vi.fn(),
  embed: vi.fn(),
}));
vi.mock("./clickhouse", () => ({ hasTopicEmbeddings: mocks.hasEmbeddings }));
vi.mock("../llm/testModelCall", () => ({ testModelCall: mocks.testCall }));
vi.mock("./embeddings", () => ({ generateTopicEmbeddings: mocks.embed }));
vi.mock("./processing-gate", () => ({
  invalidateTopicsProcessingActive: mocks.invalidate,
}));
vi.mock("../services/LLMApiKeys", () => ({
  listEffectiveLlmApiKeys: mocks.effective,
  toProjectLlmApiKey: (
    connection: Record<string, unknown>,
    projectId: string,
  ) => ({ ...connection, projectId }),
}));
vi.mock("../../db", () => ({
  prisma: {
    topicConfig: {
      findMany: mocks.configs,
      findUnique: mocks.current,
      updateMany: mocks.pause,
      upsert: mocks.upsert,
    },
  },
}));

const connection = (id: string, adapter: LLMAdapter) => ({
  id,
  projectId: "project",
  organizationId: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  adapter,
  provider: `${adapter}-connection`,
  displaySecretKey: "...pted",
  secretKey: "encrypted",
  extraHeaders: null,
  extraHeaderKeys: [],
  baseURL: null,
  customModels: [],
  withDefaultModels: true,
  config: null,
});
const slot = (provider: string, model: string) => ({ provider, model });
const settings = {
  summary: slot(`${LLMAdapter.OpenAI}-connection`, "gpt-6-luna"),
  embedding: slot(`${LLMAdapter.OpenAI}-connection`, "text-embedding-3-small"),
  embeddingDimensions: 1024 as const,
  clustering: slot(`${LLMAdapter.OpenAI}-connection`, "gpt-5.6-terra"),
  enabled: true,
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
  mocks.effective.mockResolvedValue([
    {
      connection: connection("openai", LLMAdapter.OpenAI),
      scope: "project",
    },
    {
      connection: connection("anthropic", LLMAdapter.Anthropic),
      scope: "project",
    },
  ]);
  mocks.current.mockResolvedValue(null);
  mocks.hasEmbeddings.mockResolvedValue(false);
  mocks.testCall.mockResolvedValue(undefined);
  mocks.embed.mockImplementation(async ({ summaries, dimensions }) => ({
    embeddings: summaries.map(() => Array(dimensions).fill(0.1)),
  }));
});

describe("prepareTopicsModelSettings", () => {
  it("accepts an organization connection inherited by the project", async () => {
    mocks.effective.mockResolvedValue([
      {
        connection: connection("openai", LLMAdapter.OpenAI),
        scope: "organization",
      },
    ]);

    await saveTopicsModelSettings("project", settings);

    expect(mocks.effective).toHaveBeenCalledWith("project");
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          summaryProvider: `${LLMAdapter.OpenAI}-connection`,
          embeddingProvider: `${LLMAdapter.OpenAI}-connection`,
          clusteringProvider: `${LLMAdapter.OpenAI}-connection`,
        }),
      }),
    );
  });

  it("saves an Anthropic connection when its test call succeeds", async () => {
    await saveTopicsModelSettings("project", {
      ...settings,
      clustering: slot(`${LLMAdapter.Anthropic}-connection`, "claude-sonnet"),
    });
    expect(mocks.testCall).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet" }),
    );
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("preserves connection provider names exactly", async () => {
    const spacedProvider = " OpenAI connection ";
    mocks.effective.mockResolvedValue([
      {
        connection: {
          ...connection("openai", LLMAdapter.OpenAI),
          provider: spacedProvider,
        },
        scope: "project",
      },
    ]);

    await saveTopicsModelSettings("project", {
      ...settings,
      summary: slot(spacedProvider, "gpt-6-luna"),
      embedding: slot(spacedProvider, "text-embedding-3-small"),
      clustering: slot(spacedProvider, "gpt-5.6-terra"),
    });

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ summaryProvider: spacedProvider }),
      }),
    );
  });

  it("saves a partial setup but enables Topics only with all three models", async () => {
    await saveTopicsModelSettings("project", {
      ...settings,
      clustering: null,
      enabled: false,
    });
    expect(mocks.upsert).toHaveBeenCalledOnce();
    await expect(
      saveTopicsModelSettings("project", { ...settings, clustering: null }),
    ).rejects.toThrow("before turning Topics on");
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("tests every configured slot and names the ones that fail", async () => {
    mocks.testCall.mockImplementation(async ({ model }) => {
      if (model === "gpt-5.6-terra")
        throw new Error("Model not found (HTTP 404)");
    });
    mocks.embed.mockResolvedValue({
      embeddings: [Array(1536).fill(0.1), Array(1536).fill(0.1)],
    });

    await expect(saveTopicsModelSettings("project", settings)).rejects.toThrow(
      "Embeddings (text-embedding-3-small): The model returned 1536 dimensions instead of 1024. Choose a size this model supports.; Topic clustering (gpt-5.6-terra): Model not found (HTTP 404)",
    );
    expect(mocks.testCall).toHaveBeenCalledTimes(2);
    expect(mocks.embed).toHaveBeenCalledWith(
      expect.objectContaining({ dimensions: 1024 }),
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each([
    [
      "model",
      {
        embedding: slot(
          `${LLMAdapter.OpenAI}-connection`,
          "text-embedding-3-large",
        ),
      },
    ],
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
        summary: slot(`${LLMAdapter.OpenAI}-connection`, "gpt-6-luna-mini"),
      });
      expect(mocks.upsert).toHaveBeenCalledOnce();
    },
  );
});

describe("getEnabledTopicsModels", () => {
  it("resolves the current effective connection by provider", async () => {
    const row = {
      projectId: "complete",
      enabled: true,
      summaryProvider: `${LLMAdapter.OpenAI}-connection`,
      summaryModel: "gpt-6-luna",
      embeddingProvider: `${LLMAdapter.OpenAI}-connection`,
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 512,
      clusteringProvider: `${LLMAdapter.OpenAI}-connection`,
      clusteringModel: "gpt-5.6-terra",
      project: {
        LlmApiKeys: [
          {
            ...connection("project-override", LLMAdapter.OpenAI),
            projectId: "complete",
            secretKey: "project-secret",
          },
        ],
        organization: {
          organizationLlmApiKeys: [
            {
              ...connection("old-organization-connection", LLMAdapter.OpenAI),
              projectId: null,
            },
          ],
        },
      },
    };
    mocks.configs.mockResolvedValue([row]);

    const models = await getEnabledTopicsModels(["complete"]);

    expect(mocks.configs).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: { in: ["complete"] },
          enabled: true,
        },
        include: {
          project: {
            select: {
              LlmApiKeys: true,
              organization: {
                select: { organizationLlmApiKeys: true },
              },
            },
          },
        },
      }),
    );
    expect(mocks.effective).not.toHaveBeenCalled();
    expect([...models.keys()]).toEqual(["complete"]);
    expect(models.get("complete")?.embedding).toMatchObject({
      adapter: LLMAdapter.OpenAI,
      model: "text-embedding-3-small",
      dimensions: 512,
      connection: {
        projectId: "complete",
        secretKey: "project-secret",
      },
    });
  });

  it("does not use a stored connection after the project loses access to its provider", async () => {
    mocks.configs.mockResolvedValue([
      {
        projectId: "transferred-project",
        enabled: true,
        summaryProvider: "old-organization-provider",
        summaryModel: "gpt-6-luna",
        embeddingProvider: "old-organization-provider",
        embeddingModel: "text-embedding-3-small",
        embeddingDimensions: 512,
        clusteringProvider: "old-organization-provider",
        clusteringModel: "gpt-5.6-terra",
        project: {
          LlmApiKeys: [],
          organization: { organizationLlmApiKeys: [] },
        },
      },
    ]);
    mocks.effective.mockResolvedValue([]);

    const models = await getEnabledTopicsModels(["transferred-project"]);

    expect(models).toEqual(new Map());
    expect(mocks.pause).toHaveBeenCalledWith({
      where: { projectId: "transferred-project", enabled: true },
      data: expect.objectContaining({
        enabled: false,
        blockReason: "LLM_CONNECTION_MISSING",
      }),
    });
  });
});
