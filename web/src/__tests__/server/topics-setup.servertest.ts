import { randomUUID } from "crypto";
import { DEFAULT_TOPIC_FACETS } from "@langfuse/shared/topics";
import { EvaluatorBlockReason, prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey, redis } from "@langfuse/shared/src/server";
import { LLMAdapter } from "@langfuse/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateTopicText: vi.fn(),
  generateTopicEmbeddings: vi.fn(),
}));
vi.mock("@langfuse/shared/src/server/topics/text", () => ({
  generateTopicText: mocks.generateTopicText,
}));
vi.mock(
  "@langfuse/shared/src/server/topics/embeddings",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    generateTopicEmbeddings: mocks.generateTopicEmbeddings,
  }),
);

import {
  listTopicRules,
  saveTopicsSetup,
  setTopicsAutomaticProcessing,
} from "@langfuse/shared/topics/server";

const pause = {
  blockedAt: new Date(),
  blockReason: EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
  blockMessage: "The provider rejected the API key.",
};
const clearedBlock = { blockedAt: null, blockReason: null, blockMessage: null };

/** A project with stored models; `stored` sets the automatic-processing state. */
async function topicsProject(
  stored: { enabled: boolean } & Partial<typeof pause> = { enabled: false },
) {
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
      ...stored,
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
    traceIdleMs: 600_000,
  };
  return { projectId, connection, setup };
}

const storedConfig = (projectId: string) =>
  prisma.topicConfig.findUniqueOrThrow({ where: { projectId } });

const modelsWork = () => {
  mocks.generateTopicText.mockImplementation(async ({ model }) => ({
    output:
      model.slot === "summary"
        ? { summary: "Account access", status: "applicable" }
        : { name: "Account access", description: "Sign-in questions" },
    usage: {},
  }));
  mocks.generateTopicEmbeddings.mockImplementation(
    async ({ summaries, dimensions }) => ({
      embeddings: summaries.map(() => Array(dimensions).fill(0.1)),
    }),
  );
};
const modelsFail = () => {
  mocks.generateTopicText.mockRejectedValue(new Error("Invalid API key."));
  mocks.generateTopicEmbeddings.mockRejectedValue(
    new Error("Invalid API key."),
  );
};

beforeEach(() => {
  mocks.generateTopicText.mockReset();
  mocks.generateTopicEmbeddings.mockReset();
});

describe("saveTopicsSetup", () => {
  it("starts with automatic processing off on the first save", async () => {
    const { projectId, setup } = await topicsProject();
    await prisma.topicConfig.delete({ where: { projectId } });
    modelsWork();

    await saveTopicsSetup(projectId, setup);

    expect(await storedConfig(projectId)).toMatchObject({
      enabled: false,
      ...clearedBlock,
    });
  });

  it("keeps automatic processing on without testing unchanged models", async () => {
    modelsFail();
    const { projectId, setup } = await topicsProject({ enabled: true });

    await saveTopicsSetup(projectId, setup);

    expect(mocks.generateTopicText).not.toHaveBeenCalled();
    expect(mocks.generateTopicEmbeddings).not.toHaveBeenCalled();
    expect(await storedConfig(projectId)).toMatchObject({ enabled: true });
  });

  it("keeps a pause and its reason without testing unchanged models", async () => {
    modelsFail();
    const { projectId, setup } = await topicsProject({
      enabled: false,
      ...pause,
    });

    await saveTopicsSetup(projectId, setup);

    expect(mocks.generateTopicText).not.toHaveBeenCalled();
    expect(mocks.generateTopicEmbeddings).not.toHaveBeenCalled();
    expect(await storedConfig(projectId)).toMatchObject({
      enabled: false,
      blockReason: pause.blockReason,
      blockMessage: pause.blockMessage,
    });
  });

  it("keeps the stored models of empty slots while off", async () => {
    const { projectId, setup } = await topicsProject({
      enabled: false,
      ...pause,
    });

    await saveTopicsSetup(projectId, {
      ...setup,
      summary: null,
      embedding: null,
      embeddingDimensions: 512,
      clustering: null,
    });

    expect(await storedConfig(projectId)).toMatchObject({
      summaryModel: "gpt-6-luna",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 1024,
      clusteringModel: "gpt-5.6-terra",
    });
  });

  it("tests only the changed models while off", async () => {
    mocks.generateTopicText.mockRejectedValue(new Error("Unknown model."));
    const { projectId, setup } = await topicsProject();

    await expect(
      saveTopicsSetup(projectId, {
        ...setup,
        clustering: { ...setup.clustering, model: "gpt-unknown" },
      }),
    ).rejects.toThrow("Unknown model.");
    expect(mocks.generateTopicText).toHaveBeenCalledOnce();
    expect(mocks.generateTopicEmbeddings).not.toHaveBeenCalled();
  });

  it("keeps the rule's sampling rate", async () => {
    const { projectId, setup } = await topicsProject();
    const { id: ruleId } = await saveTopicsSetup(projectId, setup);
    await setTopicsAutomaticProcessing(projectId, {
      enabled: false,
      sampling: 0.25,
    });

    await saveTopicsSetup(projectId, { ...setup, ruleId });

    const [rule] = await listTopicRules(projectId);
    expect(rule?.sampling).toBe(0.25);
  });
});

describe("setTopicsAutomaticProcessing", () => {
  it("tests the models, clears the pause and saves sampling when turned on", async () => {
    const { projectId, setup } = await topicsProject({
      enabled: false,
      ...pause,
    });
    await saveTopicsSetup(projectId, setup);
    modelsWork();
    const cacheKey = `langfuse:topics:processing-active:${projectId}`;
    await redis?.set(cacheKey, "0");

    const { ruleBefore, ruleAfter } = await setTopicsAutomaticProcessing(
      projectId,
      { enabled: true, sampling: 0.5 },
    );

    expect(mocks.generateTopicText).toHaveBeenCalledTimes(2);
    expect(mocks.generateTopicEmbeddings).toHaveBeenCalledOnce();
    expect(await storedConfig(projectId)).toMatchObject({
      enabled: true,
      ...clearedBlock,
    });
    expect([ruleBefore.sampling, ruleAfter.sampling]).toEqual([1, 0.5]);
    expect(await redis?.get(cacheKey)).toBeNull();
  });

  it("stays paused when a model test fails", async () => {
    const { projectId, setup } = await topicsProject({
      enabled: false,
      ...pause,
    });
    await saveTopicsSetup(projectId, setup);
    modelsFail();

    await expect(
      setTopicsAutomaticProcessing(projectId, { enabled: true }),
    ).rejects.toThrow("Invalid API key.");
    expect(await storedConfig(projectId)).toMatchObject({
      enabled: false,
      blockReason: pause.blockReason,
    });
  });

  it("refuses to turn on after a connection was deleted while off", async () => {
    modelsWork();
    const { projectId, connection, setup } = await topicsProject();
    await saveTopicsSetup(projectId, setup);
    await prisma.llmApiKeys.delete({ where: { id: connection.id } });

    await expect(
      setTopicsAutomaticProcessing(projectId, { enabled: true }),
    ).rejects.toThrow("before turning on automatic processing");
    expect(await storedConfig(projectId)).toMatchObject({
      enabled: false,
      ...clearedBlock,
    });
  });

  it("turns off and clears a pause without testing the models", async () => {
    modelsFail();
    const { projectId, setup } = await topicsProject({
      enabled: false,
      ...pause,
    });
    await saveTopicsSetup(projectId, setup);

    await setTopicsAutomaticProcessing(projectId, { enabled: false });

    expect(mocks.generateTopicText).not.toHaveBeenCalled();
    expect(await storedConfig(projectId)).toMatchObject({
      enabled: false,
      ...clearedBlock,
    });
  });

  it("refuses before the setup was saved", async () => {
    const { projectId } = await topicsProject();

    await expect(
      setTopicsAutomaticProcessing(projectId, { enabled: true }),
    ).rejects.toThrow("Save the Topics setup");
  });
});
