import type { LlmApiKeys, Prisma, TopicsModelConfig } from "@prisma/client";
import { prisma } from "../../db";
import { InvalidRequestError } from "../../errors";
import {
  getClientInitiatedNonStreamingLlmTimeoutMs,
  type LLMConnection,
} from "../llm/llmText";
import { testModelCall } from "../llm/testModelCall";
import { LLMAdapter, type LLMApiKeySchema } from "../llm/types";
import {
  TOPICS_MODEL_SLOT_DETAILS,
  TOPICS_SUPPORTED_ADAPTERS,
  type TopicsModelSettings,
  type TopicsModelSlotName,
} from "../../topics";
import { hasTopicEmbeddings } from "./clickhouse";
import { generateTopicEmbedding } from "./embeddings";
import { z } from "zod";

export type TopicsModel = {
  slot: TopicsModelSlotName;
  provider: string;
  adapter: LLMAdapter;
  model: string;
  connection: LLMConnection;
};

/** Resolved models of a project whose three slots are all configured. */
export type TopicsModels = {
  projectId: string;
  enabled: boolean;
  summary: TopicsModel;
  embedding: TopicsModel & { dimensions: number };
  clustering: TopicsModel;
};

const withConnections = {
  summaryLlmApiKey: true,
  embeddingLlmApiKey: true,
  clusteringLlmApiKey: true,
} as const;

type ConfigWithConnections = TopicsModelConfig & {
  summaryLlmApiKey: LlmApiKeys | null;
  embeddingLlmApiKey: LlmApiKeys | null;
  clusteringLlmApiKey: LlmApiKeys | null;
};

function resolveSlot(
  slot: TopicsModelSlotName,
  key: LlmApiKeys | null,
  model: string | null,
): TopicsModel | null {
  if (!key || !model || !TOPICS_SUPPORTED_ADAPTERS.includes(key.adapter))
    return null;
  return {
    slot,
    provider: key.provider,
    adapter: key.adapter as LLMAdapter,
    model,
    connection: {
      secretKey: key.secretKey,
      extraHeaders: key.extraHeaders,
      baseURL: key.baseURL,
      config: key.config as LLMConnection["config"],
    },
  };
}

function resolveModels(row: ConfigWithConnections): TopicsModels | null {
  const summary = resolveSlot(
    "summary",
    row.summaryLlmApiKey,
    row.summaryModel,
  );
  const embedding = resolveSlot(
    "embedding",
    row.embeddingLlmApiKey,
    row.embeddingModel,
  );
  const clustering = resolveSlot(
    "clustering",
    row.clusteringLlmApiKey,
    row.clusteringModel,
  );
  if (!summary || !embedding || !clustering) return null;
  return {
    projectId: row.projectId,
    enabled: row.enabled,
    summary,
    embedding: { ...embedding, dimensions: row.embeddingDimensions },
    clustering,
  };
}

/** Returns the configured models of a project, or null while any slot is missing. */
export async function getTopicsModels(
  projectId: string,
): Promise<TopicsModels | null> {
  const row = await prisma.topicsModelConfig.findUnique({
    where: { projectId },
    include: withConnections,
  });
  return row ? resolveModels(row) : null;
}

/** Loads the enabled, fully configured projects of a trace batch in one query. */
export async function getEnabledTopicsModels(
  projectIds: string[],
): Promise<Map<string, TopicsModels>> {
  if (!projectIds.length) return new Map();
  const rows = await prisma.topicsModelConfig.findMany({
    where: { projectId: { in: projectIds }, enabled: true },
    include: withConnections,
  });
  const models = new Map<string, TopicsModels>();
  for (const row of rows) {
    const resolved = resolveModels(row);
    if (resolved) models.set(row.projectId, resolved);
  }
  return models;
}

/** Turns automatic processing off and records why, for the Topics page. */
export async function pauseTopicsModels(
  projectId: string,
  reason: string,
): Promise<void> {
  await prisma.topicsModelConfig.updateMany({
    where: { projectId, enabled: true },
    data: { enabled: false, pausedReason: reason },
  });
}

/** Pauses Topics in every config that uses a connection about to be deleted. */
export async function pauseTopicsModelsUsingConnection(
  params: { projectId: string; llmApiKeyId: string; provider: string },
  tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  const { projectId, llmApiKeyId, provider } = params;
  await tx.topicsModelConfig.updateMany({
    where: {
      projectId,
      OR: [
        { summaryLlmApiKeyId: llmApiKeyId },
        { embeddingLlmApiKeyId: llmApiKeyId },
        { clusteringLlmApiKeyId: llmApiKeyId },
      ],
    },
    data: {
      enabled: false,
      pausedReason: `The LLM connection "${provider}" was deleted. Choose another connection and turn Topics on again.`,
    },
  });
}

/** Settings shown in the Topics page; never includes secrets. */
export async function readTopicsModelSettings(projectId: string) {
  const row = await prisma.topicsModelConfig.findUnique({
    where: { projectId },
  });
  const slot = (llmApiKeyId: string | null, model: string | null) =>
    llmApiKeyId && model ? { llmApiKeyId, model } : null;
  return {
    summary: slot(row?.summaryLlmApiKeyId ?? null, row?.summaryModel ?? null),
    embedding: slot(
      row?.embeddingLlmApiKeyId ?? null,
      row?.embeddingModel ?? null,
    ),
    embeddingDimensions: row?.embeddingDimensions ?? 1024,
    clustering: slot(
      row?.clusteringLlmApiKeyId ?? null,
      row?.clusteringModel ?? null,
    ),
    enabled: row?.enabled ?? false,
    pausedReason: row?.pausedReason ?? null,
  };
}

export async function saveTopicsModelSettings(
  projectId: string,
  settings: TopicsModelSettings,
): Promise<void> {
  const ids = [
    settings.summary,
    settings.embedding,
    settings.clustering,
  ].flatMap((slot) => (slot ? [slot.llmApiKeyId] : []));
  const keys = await prisma.llmApiKeys.findMany({
    where: { projectId, id: { in: ids } },
  });
  for (const id of ids) {
    const key = keys.find((candidate) => candidate.id === id);
    if (!key)
      throw new InvalidRequestError(
        "LLM connection not found in this project.",
      );
    if (!TOPICS_SUPPORTED_ADAPTERS.includes(key.adapter))
      throw new InvalidRequestError(
        key.adapter === LLMAdapter.Anthropic
          ? `"${key.provider}" is an Anthropic connection. Topics needs OpenAI, Azure OpenAI, Amazon Bedrock, or Google connections because Anthropic has no embeddings API.`
          : `"${key.provider}" cannot be used for Topics.`,
      );
  }
  if (
    settings.enabled &&
    (!settings.summary || !settings.embedding || !settings.clustering)
  )
    throw new InvalidRequestError(
      "Choose a summary, embedding, and clustering model before turning Topics on.",
    );

  const current = await prisma.topicsModelConfig.findUnique({
    where: { projectId },
  });
  const embeddingChanged =
    current?.embeddingModel &&
    (settings.embedding?.model !== current.embeddingModel ||
      settings.embeddingDimensions !== current.embeddingDimensions);
  if (embeddingChanged && (await hasTopicEmbeddings(projectId)))
    throw new InvalidRequestError(
      "The embedding model and dimensions cannot change after summaries were embedded; existing vectors could no longer be clustered together.",
    );

  await testTopicsModels(settings, keys);

  const data = {
    enabled: settings.enabled,
    // Saving the settings acknowledges the last pause.
    pausedReason: null,
    summaryLlmApiKeyId: settings.summary?.llmApiKeyId ?? null,
    summaryModel: settings.summary?.model ?? null,
    embeddingLlmApiKeyId: settings.embedding?.llmApiKeyId ?? null,
    embeddingModel: settings.embedding?.model ?? null,
    embeddingDimensions: settings.embeddingDimensions,
    clusteringLlmApiKeyId: settings.clustering?.llmApiKeyId ?? null,
    clusteringModel: settings.clustering?.model ?? null,
  };
  await prisma.topicsModelConfig.upsert({
    where: { projectId },
    create: { projectId, ...data },
    update: data,
  });
}

const TEST_SCHEMAS = {
  summary: z.object({
    summary: z.string(),
    status: z.enum(["applicable", "not_applicable", "insufficient_input"]),
  }),
  clustering: z.object({ name: z.string(), description: z.string() }),
};

/**
 * Makes one real call per configured slot, like the evaluator model check:
 * structured output for summaries and clustering, and an embedding whose
 * length must match the configured dimensions.
 */
async function testTopicsModels(
  settings: TopicsModelSettings,
  keys: LlmApiKeys[],
): Promise<void> {
  const key = (id: string) => keys.find((candidate) => candidate.id === id)!;
  const checks = (["summary", "embedding", "clustering"] as const).flatMap(
    (name) => {
      const slot = settings[name];
      if (!slot) return [];
      const llmApiKey = key(slot.llmApiKeyId);
      const check = async () => {
        if (name !== "embedding")
          return testModelCall({
            provider: llmApiKey.provider,
            model: slot.model,
            apiKey: llmApiKey as z.infer<typeof LLMApiKeySchema>,
            structuredOutputSchema: TEST_SCHEMAS[name],
            timeout: getClientInitiatedNonStreamingLlmTimeoutMs(),
          });
        const { embedding } = await generateTopicEmbedding({
          model: resolveSlot(name, llmApiKey, slot.model)!,
          summary: "Topics model check",
          dimensions: settings.embeddingDimensions,
        });
        if (embedding.length !== settings.embeddingDimensions)
          throw new Error(
            `The model returned ${embedding.length} dimensions instead of ${settings.embeddingDimensions}. Choose a size this model supports.`,
          );
      };
      return [
        check().then(
          () => null,
          (error: unknown) =>
            `${TOPICS_MODEL_SLOT_DETAILS[name].label} (${slot.model}): ${
              error instanceof Error ? error.message.slice(0, 300) : "failed"
            }`,
        ),
      ];
    },
  );
  const failures = (await Promise.all(checks)).filter(Boolean);
  if (failures.length)
    throw new InvalidRequestError(
      `The test call failed for ${failures.join("; ")}`,
    );
}
