import {
  EvaluatorBlockReason,
  type Prisma,
  type TopicConfig,
} from "@prisma/client";
import { prisma } from "../../db";
import { InvalidRequestError } from "../../errors";
import {
  getClientInitiatedNonStreamingLlmTimeoutMs,
  type LLMConnection,
} from "../llm/llmText";
import { testModelCall } from "../llm/testModelCall";
import { LLMAdapter, type LLMApiKey, type LLMApiKeySchema } from "../llm/types";
import { listEffectiveLlmApiKeys } from "../services/LLMApiKeys";
import {
  TOPICS_MODEL_SLOT_DETAILS,
  TOPICS_MODEL_SLOTS,
  type TopicsModelSettings,
  type TopicsModelSlotName,
} from "../../topics";
import { hasTopicEmbeddings } from "./clickhouse";
import { generateTopicEmbeddings } from "./embeddings";
import { invalidateTopicsProcessingActive } from "./processing-gate";
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

function resolveSlot(
  slot: TopicsModelSlotName,
  key: LLMApiKey | undefined,
  model: string | null,
): TopicsModel | null {
  if (!key || !model) return null;
  return {
    slot,
    provider: key.provider,
    adapter: key.adapter as LLMAdapter,
    model,
    connection: {
      projectId: key.projectId ?? undefined,
      secretKey: key.secretKey,
      extraHeaders: key.extraHeaders,
      baseURL: key.baseURL,
      config: key.config as LLMConnection["config"],
    },
  };
}

function resolveModels(
  row: TopicConfig,
  connections: Map<string, LLMApiKey>,
): TopicsModels | null {
  const summary = resolveSlot(
    "summary",
    row.summaryProvider ? connections.get(row.summaryProvider) : undefined,
    row.summaryModel,
  );
  const embedding = resolveSlot(
    "embedding",
    row.embeddingProvider ? connections.get(row.embeddingProvider) : undefined,
    row.embeddingModel,
  );
  const clustering = resolveSlot(
    "clustering",
    row.clusteringProvider
      ? connections.get(row.clusteringProvider)
      : undefined,
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

async function resolveConfig(row: TopicConfig): Promise<TopicsModels | null> {
  const effective = await listEffectiveLlmApiKeys(row.projectId);
  return resolveModels(
    row,
    new Map(
      effective.map(({ connection }) => [connection.provider, connection]),
    ),
  );
}

/** Returns the configured models of a project, or null while any slot is missing. */
export async function getTopicsModels(
  projectId: string,
): Promise<TopicsModels | null> {
  const row = await prisma.topicConfig.findUnique({
    where: { projectId },
  });
  return row ? resolveConfig(row) : null;
}

/** Loads the enabled, fully configured projects of a trace batch in one query. */
export async function getEnabledTopicsModels(
  projectIds: string[],
): Promise<Map<string, TopicsModels>> {
  if (!projectIds.length) return new Map();
  const rows = await prisma.topicConfig.findMany({
    where: { projectId: { in: projectIds }, enabled: true },
  });
  const models = new Map<string, TopicsModels>();
  await Promise.all(
    rows.map(async (row) => {
      const resolved = await resolveConfig(row);
      if (resolved) models.set(row.projectId, resolved);
    }),
  );
  return models;
}

/** Turns automatic processing off and records why, for the Topics page. */
export async function pauseTopicsModels(
  projectId: string,
  block: { blockReason: EvaluatorBlockReason; blockMessage: string },
): Promise<void> {
  await prisma.topicConfig.updateMany({
    where: { projectId, enabled: true },
    data: {
      enabled: false,
      blockedAt: new Date(),
      blockReason: block.blockReason,
      blockMessage: block.blockMessage,
    },
  });
  await invalidateTopicsProcessingActive(projectId);
}

/**
 * Pauses Topics in a project that uses a provider with no effective fallback.
 * Callers that pass a transaction call `invalidateTopicsProcessingActive`
 * after it commits.
 */
export async function pauseTopicsModelsUsingProvider(
  params: { projectId: string; provider: string },
  tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  const { projectId, provider } = params;
  await tx.topicConfig.updateMany({
    where: {
      projectId,
      OR: [
        { summaryProvider: provider },
        { embeddingProvider: provider },
        { clusteringProvider: provider },
      ],
    },
    data: {
      enabled: false,
      blockedAt: new Date(),
      blockReason: EvaluatorBlockReason.LLM_CONNECTION_MISSING,
      blockMessage: `The LLM connection "${provider}" was deleted. Choose another connection and turn Topics on again.`,
    },
  });
}

/** Settings shown in the Topics page; never includes secrets. */
export async function readTopicsModelSettings(projectId: string) {
  const row = await prisma.topicConfig.findUnique({
    where: { projectId },
  });
  const slot = (provider: string | null, model: string | null) =>
    provider && model ? { provider, model } : null;
  return {
    summary: slot(row?.summaryProvider ?? null, row?.summaryModel ?? null),
    embedding: slot(
      row?.embeddingProvider ?? null,
      row?.embeddingModel ?? null,
    ),
    embeddingDimensions: row?.embeddingDimensions ?? 1024,
    clustering: slot(
      row?.clusteringProvider ?? null,
      row?.clusteringModel ?? null,
    ),
    enabled: row?.enabled ?? false,
    blockedAt: row?.blockedAt ?? null,
    blockReason: row?.blockReason ?? null,
    blockMessage: row?.blockMessage ?? null,
  };
}

async function loadTopicsModelKeys(
  projectId: string,
  settings: TopicsModelSettings,
) {
  const providers = [
    settings.summary,
    settings.embedding,
    settings.clustering,
  ].flatMap((slot) => (slot ? [slot.provider] : []));
  const keys = (await listEffectiveLlmApiKeys(projectId)).map(
    ({ connection }) => connection,
  );
  for (const provider of providers) {
    if (!keys.some((key) => key.provider === provider))
      throw new InvalidRequestError(
        "LLM connection not found in this project.",
      );
  }
  return keys;
}

/** Real call per configured slot. The message is the provider error for that row. */
export async function checkTopicsModelSettings(
  projectId: string,
  settings: TopicsModelSettings,
): Promise<Partial<Record<TopicsModelSlotName, string>>> {
  return testTopicsModelSlots(
    settings,
    await loadTopicsModelKeys(projectId, settings),
  );
}

/**
 * Validates and tests the settings without writing them, so callers can save
 * related configuration first and commit the models last.
 */
export async function prepareTopicsModelSettings(
  projectId: string,
  settings: TopicsModelSettings,
) {
  const keys = await loadTopicsModelKeys(projectId, settings);
  if (
    settings.enabled &&
    (!settings.summary || !settings.embedding || !settings.clustering)
  )
    throw new InvalidRequestError(
      "Choose a summary, embedding, and clustering model before turning Topics on.",
    );

  const current = await prisma.topicConfig.findUnique({
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

  const connectionId = (provider: string | undefined) =>
    provider
      ? (keys.find((key) => key.provider === provider)?.id ?? null)
      : null;
  const data = {
    enabled: settings.enabled,
    // Saving the settings acknowledges the last pause.
    blockedAt: null,
    blockReason: null,
    blockMessage: null,
    summaryProvider: settings.summary?.provider ?? null,
    summaryLlmApiKeyId: connectionId(settings.summary?.provider),
    summaryModel: settings.summary?.model ?? null,
    embeddingProvider: settings.embedding?.provider ?? null,
    embeddingLlmApiKeyId: connectionId(settings.embedding?.provider),
    embeddingModel: settings.embedding?.model ?? null,
    embeddingDimensions: settings.embeddingDimensions,
    clusteringProvider: settings.clustering?.provider ?? null,
    clusteringLlmApiKeyId: connectionId(settings.clustering?.provider),
    clusteringModel: settings.clustering?.model ?? null,
  };
  return data;
}

export async function writeTopicsModelSettings(
  projectId: string,
  data: Awaited<ReturnType<typeof prepareTopicsModelSettings>>,
  {
    userId = null,
    tx = prisma,
  }: { userId?: string | null; tx?: Prisma.TransactionClient } = {},
): Promise<void> {
  await tx.topicConfig.upsert({
    where: { projectId },
    create: { projectId, ...data, createdBy: userId, updatedBy: userId },
    update: { ...data, updatedBy: userId },
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
 * length must match the configured dimensions. A slot with no error is omitted.
 */
async function testTopicsModelSlots(
  settings: TopicsModelSettings,
  keys: LLMApiKey[],
): Promise<Partial<Record<TopicsModelSlotName, string>>> {
  const errors: Partial<Record<TopicsModelSlotName, string>> = {};
  await Promise.all(
    TOPICS_MODEL_SLOTS.map(async (name) => {
      const slot = settings[name];
      if (!slot) return;
      const llmApiKey = keys.find(
        (candidate) => candidate.provider === slot.provider,
      );
      if (!llmApiKey) {
        errors[name] = "LLM connection not found in this project.";
        return;
      }
      try {
        if (name !== "embedding") {
          await testModelCall({
            provider: llmApiKey.provider,
            model: slot.model,
            apiKey: llmApiKey as z.infer<typeof LLMApiKeySchema>,
            structuredOutputSchema: TEST_SCHEMAS[name],
            timeout: getClientInitiatedNonStreamingLlmTimeoutMs(),
          });
          return;
        }
        const resolved = resolveSlot(name, llmApiKey, slot.model);
        if (!resolved) {
          errors[name] = "LLM connection not found in this project.";
          return;
        }
        // Two texts, because processing embeds a trace's facets in one call.
        const { embeddings } = await generateTopicEmbeddings({
          model: resolved,
          summaries: ["Topics model check", "Topics batch check"],
          dimensions: settings.embeddingDimensions,
        });
        if (embeddings.length !== 2)
          throw new Error(
            "The model must embed several texts in one request. Choose an embedding model or endpoint that supports batched input.",
          );
        const wrong = embeddings.find(
          (vector) => vector.length !== settings.embeddingDimensions,
        );
        if (wrong)
          throw new Error(
            `The model returned ${wrong.length} dimensions instead of ${settings.embeddingDimensions}. Choose a size this model supports.`,
          );
      } catch (error) {
        errors[name] =
          error instanceof Error
            ? error.message.slice(0, 300)
            : "The test call failed.";
      }
    }),
  );
  return errors;
}

async function testTopicsModels(
  settings: TopicsModelSettings,
  keys: LLMApiKey[],
): Promise<void> {
  const errors = await testTopicsModelSlots(settings, keys);
  const failures = TOPICS_MODEL_SLOTS.flatMap((name) => {
    const message = errors[name];
    const slot = settings[name];
    return message && slot
      ? [`${TOPICS_MODEL_SLOT_DETAILS[name].label} (${slot.model}): ${message}`]
      : [];
  });
  if (failures.length)
    throw new InvalidRequestError(
      `The test call failed for ${failures.join("; ")}`,
    );
}
