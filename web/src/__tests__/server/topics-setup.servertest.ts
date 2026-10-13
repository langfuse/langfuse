import { randomUUID } from "crypto";
import { DEFAULT_TOPIC_FACETS } from "@langfuse/shared/topics";
import { EvaluatorBlockReason, prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { LLMAdapter } from "@langfuse/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  testModelCall: vi.fn(),
  generateTopicEmbedding: vi.fn(),
}));
vi.mock("@langfuse/shared/src/server/llm/testModelCall", () => ({
  testModelCall: mocks.testModelCall,
}));
vi.mock(
  "@langfuse/shared/src/server/topics/embeddings",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    generateTopicEmbedding: mocks.generateTopicEmbedding,
  }),
);

import { saveTopicsSetup } from "@langfuse/shared/topics/server";

async function pausedProject() {
  const { projectId } = await createOrgProjectAndApiKey();
  const connection = await prisma.llmApiKeys.create({
    data: {
      projectId,
      provider: `openai-${randomUUID()}`,
      adapter: LLMAdapter.OpenAI,
      secretKey: "encrypted",
      displaySecretKey: "...key",
    },
  });
  const slot = (model: string) => ({ llmApiKeyId: connection.id, model });
  await prisma.topicConfig.create({
    data: {
      projectId,
      enabled: false,
      blockedAt: new Date(),
      blockReason: EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
      blockMessage: "The provider rejected the API key.",
      summaryLlmApiKeyId: connection.id,
      summaryModel: "gpt-6-luna",
      embeddingLlmApiKeyId: connection.id,
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 1024,
      clusteringLlmApiKeyId: connection.id,
      clusteringModel: "gpt-5.6-terra",
    },
  });
  const setup = {
    summary: slot("gpt-6-luna"),
    embedding: slot("text-embedding-3-small"),
    embeddingDimensions: 1024,
    clustering: slot("gpt-5.6-terra"),
    facets: DEFAULT_TOPIC_FACETS.map((facet) => ({
      name: facet.name,
      enabled: true,
    })),
    filter: [],
    sampling: 1,
    traceIdleMs: 600_000,
  };
  return { projectId, setup };
}

const clearedBlock = { blockedAt: null, blockReason: null, blockMessage: null };

describe("saveTopicsSetup automatic processing", () => {
  beforeEach(() => {
    mocks.testModelCall.mockReset();
    mocks.generateTopicEmbedding.mockReset();
  });

  it("saves with automatic processing off without testing the models", async () => {
    mocks.testModelCall.mockRejectedValue(new Error("Invalid API key."));
    mocks.generateTopicEmbedding.mockRejectedValue(
      new Error("Invalid API key."),
    );
    const { projectId, setup } = await pausedProject();

    await saveTopicsSetup(projectId, { ...setup, enabled: false });

    expect(mocks.testModelCall).not.toHaveBeenCalled();
    expect(mocks.generateTopicEmbedding).not.toHaveBeenCalled();
    expect(
      await prisma.topicConfig.findUniqueOrThrow({ where: { projectId } }),
    ).toMatchObject({ enabled: false, ...clearedBlock });
  });

  it("tests the models and clears the pause when turned on", async () => {
    mocks.testModelCall.mockResolvedValue(undefined);
    mocks.generateTopicEmbedding.mockImplementation(async ({ dimensions }) => ({
      embedding: Array(dimensions).fill(0.1),
    }));
    const { projectId, setup } = await pausedProject();

    await saveTopicsSetup(projectId, { ...setup, enabled: true });

    expect(mocks.testModelCall).toHaveBeenCalledTimes(2);
    expect(mocks.generateTopicEmbedding).toHaveBeenCalledOnce();
    expect(
      await prisma.topicConfig.findUniqueOrThrow({ where: { projectId } }),
    ).toMatchObject({ enabled: true, ...clearedBlock });
  });
});
