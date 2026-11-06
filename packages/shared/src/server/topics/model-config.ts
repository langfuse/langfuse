import {
  EvaluatorBlockReason,
  type LlmApiKeys,
  type Prisma,
  type TopicConfig,
} from "@prisma/client";
import { prisma } from "../../db";
import { InvalidRequestError } from "../../errors/InvalidRequestError";
import {
  getClientInitiatedNonStreamingLlmTimeoutMs,
  type LLMConnection,
} from "../llm/llmText";
import { LLMAdapter } from "../llm/types";
import { findCompatibleLlmApiKeysForProjects } from "../services/LLMApiKeys/findCompatibleLlmApiKeysForProjects";
import { findProjectLlmApiKeyCandidates } from "../services/LLMApiKeys/LlmApiKeyRepository";
import {
  TOPICS_MODEL_SLOT_DETAILS,
  TOPICS_MODEL_SLOTS,
  type TopicsModelSettings,
  type TopicsModelSlotName,
} from "../../topics";
import { hasTopicEmbeddings } from "./clickhouse";
import { generateTopicEmbeddings } from "./embeddings";
import { generateTopicText } from "./text";
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

/** Settings after each provider resolved to the project's effective connection. */
type ConnectionSlot = { llmApiKeyId: string; model: string } | null;
type ResolvedModelSettings = {
  summary: ConnectionSlot;
  embedding: ConnectionSlot;
  embeddingDimensions: number;
  clustering: ConnectionSlot;
};

type LlmApiKeyCandidates = {
  projectConnections: LlmApiKeys[];
  organizationConnections: LlmApiKeys[];
};

/** Like evals: a project connection overrides its organization's connection of the same provider. */
function effectiveConnection(
  candidates: LlmApiKeyCandidates | null,
  provider: string,
): LlmApiKeys | null {
  const byProvider = (key: LlmApiKeys) => key.provider === provider;
  return (
    candidates?.projectConnections.find(byProvider) ??
    candidates?.organizationConnections.find(byProvider) ??
    null
  );
}

const storedProvider = { select: { provider: true } } as const;
const withStoredProviders = {
  project: { select: { orgId: true } },
  summaryLlmApiKey: storedProvider,
  embeddingLlmApiKey: storedProvider,
  clusteringLlmApiKey: storedProvider,
} as const;

type StoredConnection = { provider: string } | null;
type ConfigWithProviders = TopicConfig & {
  project: { orgId: string };
  summaryLlmApiKey: StoredConnection;
  embeddingLlmApiKey: StoredConnection;
  clusteringLlmApiKey: StoredConnection;
};

function resolveSlot(
  slot: TopicsModelSlotName,
  key: LlmApiKeys | null,
  model: string | null,
  projectId?: string,
): TopicsModel | null {
  if (!key || !model) return null;
  return {
    slot,
    provider: key.provider,
    adapter: key.adapter as LLMAdapter,
    model,
    connection: {
      projectId: projectId ?? key.projectId ?? undefined,
      secretKey: key.secretKey,
      extraHeaders: key.extraHeaders,
      baseURL: key.baseURL,
      config: key.config as LLMConnection["config"],
    },
  };
}

/** The stored connection only names the provider; it resolves again on every run, like evals. */
function resolveModels(
  row: ConfigWithProviders,
  candidates: LlmApiKeyCandidates,
): TopicsModels | null {
  const slot = (
    name: TopicsModelSlotName,
    stored: StoredConnection,
    model: string | null,
  ) =>
    resolveSlot(
      name,
      stored && effectiveConnection(candidates, stored.provider),
      model,
      row.projectId,
    );
  const summary = slot("summary", row.summaryLlmApiKey, row.summaryModel);
  const embedding = slot(
    "embedding",
    row.embeddingLlmApiKey,
    row.embeddingModel,
  );
  const clustering = slot(
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

/** Like evals, loads only the connections of the stored providers, in one query for all configs. */
async function resolveConfigs(
  rows: ConfigWithProviders[],
): Promise<TopicsModels[]> {
  const providers = [
    ...new Set(
      rows.flatMap((row) =>
        [row.summaryLlmApiKey, row.embeddingLlmApiKey, row.clusteringLlmApiKey]
          .filter((stored) => stored !== null)
          .map(({ provider }) => provider),
      ),
    ),
  ];
  const keys = providers.length
    ? await prisma.llmApiKeys.findMany({
        where: {
          provider: { in: providers },
          OR: [
            { projectId: { in: rows.map((row) => row.projectId) } },
            { organizationId: { in: rows.map((row) => row.project.orgId) } },
          ],
        },
      })
    : [];
  return rows.flatMap((row) => {
    const resolved = resolveModels(row, {
      projectConnections: keys.filter((key) => key.projectId === row.projectId),
      organizationConnections: keys.filter(
        (key) => key.organizationId === row.project.orgId,
      ),
    });
    return resolved ? [resolved] : [];
  });
}

/** Returns the configured models of a project, or null while any slot is missing. */
export async function getTopicsModels(
  projectId: string,
): Promise<TopicsModels | null> {
  const row = await prisma.topicConfig.findUnique({
    where: { projectId },
    include: withStoredProviders,
  });
  return row ? ((await resolveConfigs([row]))[0] ?? null) : null;
}

/** Loads the enabled, fully configured projects of a trace batch in two queries. */
export async function getEnabledTopicsModels(
  projectIds: string[],
): Promise<Map<string, TopicsModels>> {
  if (!projectIds.length) return new Map();
  const rows = await prisma.topicConfig.findMany({
    where: { projectId: { in: projectIds }, enabled: true },
    include: withStoredProviders,
  });
  return new Map(
    (await resolveConfigs(rows)).map((models) => [models.projectId, models]),
  );
}

/** Turns automatic processing off and records why, for the Topics page. */
/** Returns whether this call paused an enabled configuration. */
export async function pauseTopicsModels(
  projectId: string,
  block: { blockReason: EvaluatorBlockReason; blockMessage: string },
): Promise<boolean> {
  const { count } = await prisma.topicConfig.updateMany({
    where: { projectId, enabled: true },
    data: {
      enabled: false,
      blockedAt: new Date(),
      blockReason: block.blockReason,
      blockMessage: block.blockMessage,
    },
  });
  await invalidateTopicsProcessingActive(projectId);
  return count > 0;
}

/** Keeps Topics connection references valid before an LLM connection is deleted. */
export async function handleTopicsLlmApiKeyDeletion(params: {
  tx: Prisma.TransactionClient;
  llmApiKeyId: string;
  llmApiKeyOwner: {
    projectId: string | null;
    organizationId: string | null;
  };
  provider: string;
  adapter: string;
}): Promise<string[]> {
  const { tx, llmApiKeyId, llmApiKeyOwner, provider, adapter } = params;
  const configs = await tx.topicConfig.findMany({
    where: {
      OR: [
        {
          summaryLlmApiKeyId: llmApiKeyId,
          summaryLlmApiKey: llmApiKeyOwner,
        },
        {
          embeddingLlmApiKeyId: llmApiKeyId,
          embeddingLlmApiKey: llmApiKeyOwner,
        },
        {
          clusteringLlmApiKeyId: llmApiKeyId,
          clusteringLlmApiKey: llmApiKeyOwner,
        },
      ],
    },
    select: {
      id: true,
      projectId: true,
      enabled: true,
      summaryLlmApiKeyId: true,
      embeddingLlmApiKeyId: true,
      clusteringLlmApiKeyId: true,
    },
  });

  const replacements = await findCompatibleLlmApiKeysForProjects({
    tx,
    projectIds: configs.map(({ projectId }) => projectId),
    provider,
    adapter,
    excludedLlmApiKeyId: llmApiKeyId,
  });

  for (const config of configs) {
    const replacement = replacements.get(config.projectId)?.id;
    const slotUpdates = {
      ...(config.summaryLlmApiKeyId === llmApiKeyId
        ? { summaryLlmApiKeyId: replacement ?? null }
        : {}),
      ...(config.embeddingLlmApiKeyId === llmApiKeyId
        ? { embeddingLlmApiKeyId: replacement ?? null }
        : {}),
      ...(config.clusteringLlmApiKeyId === llmApiKeyId
        ? { clusteringLlmApiKeyId: replacement ?? null }
        : {}),
    };
    await tx.topicConfig.update({
      where: { id: config.id },
      data: replacement
        ? slotUpdates
        : {
            ...slotUpdates,
            ...(config.enabled
              ? {
                  enabled: false,
                  blockedAt: new Date(),
                  blockReason: EvaluatorBlockReason.LLM_CONNECTION_MISSING,
                  blockMessage: `The LLM connection "${provider}" was deleted. Choose another connection and turn Topics on again.`,
                }
              : {}),
          },
    });
  }

  return configs.map(({ projectId }) => projectId);
}

/** Rebinds inherited Topics connections after a project changes organization. */
export async function reconcileTopicsConnectionsForProject(
  projectId: string,
): Promise<void> {
  const changed = await prisma.$transaction(async (tx) => {
    const config = await tx.topicConfig.findUnique({
      where: { projectId },
      include: {
        project: { select: { orgId: true } },
        summaryLlmApiKey: true,
        embeddingLlmApiKey: true,
        clusteringLlmApiKey: true,
      },
    });
    if (!config) return false;

    const keys = [
      config.summaryLlmApiKey,
      config.embeddingLlmApiKey,
      config.clusteringLlmApiKey,
    ];
    const inaccessibleKeys = keys.filter(
      (key) =>
        key &&
        key.projectId !== projectId &&
        key.organizationId !== config.project.orgId,
    );
    if (inaccessibleKeys.length === 0) return false;

    const uniqueInaccessibleKeys = [
      ...new Map(
        inaccessibleKeys.flatMap((key) => (key ? [[key.id, key]] : [])),
      ).values(),
    ];
    const replacementByLlmApiKeyId = new Map(
      await Promise.all(
        uniqueInaccessibleKeys.map(async (key) => {
          const replacements = await findCompatibleLlmApiKeysForProjects({
            tx,
            projectIds: [projectId],
            provider: key.provider,
            adapter: key.adapter,
            excludedLlmApiKeyId: key.id,
          });
          return [key.id, replacements.get(projectId)?.id] as const;
        }),
      ),
    );

    const resolveKeyId = (key: LlmApiKeys | null) => {
      if (!key) return null;
      if (
        key.projectId === projectId ||
        key.organizationId === config.project.orgId
      )
        return key.id;
      return replacementByLlmApiKeyId.get(key.id) ?? null;
    };
    const summaryLlmApiKeyId = resolveKeyId(config.summaryLlmApiKey);
    const embeddingLlmApiKeyId = resolveKeyId(config.embeddingLlmApiKey);
    const clusteringLlmApiKeyId = resolveKeyId(config.clusteringLlmApiKey);
    const hasMissingConnection =
      !summaryLlmApiKeyId || !embeddingLlmApiKeyId || !clusteringLlmApiKeyId;

    await tx.topicConfig.update({
      where: { id: config.id },
      data: {
        summaryLlmApiKeyId,
        embeddingLlmApiKeyId,
        clusteringLlmApiKeyId,
        ...(hasMissingConnection
          ? {
              enabled: false,
              blockedAt: new Date(),
              blockReason: EvaluatorBlockReason.LLM_CONNECTION_MISSING,
              blockMessage:
                "A configured LLM connection is not available in this organization. Choose another connection and turn Topics on again.",
            }
          : {}),
      },
    });
    return true;
  });

  if (changed) await invalidateTopicsProcessingActive(projectId);
}

/**
 * Settings shown in the Topics page; never includes secrets. `enabled` is null
 * until the project saves Topics for the first time.
 */
export async function readTopicsModelSettings(projectId: string) {
  const row = await prisma.topicConfig.findUnique({
    where: { projectId },
    include: {
      summaryLlmApiKey: storedProvider,
      embeddingLlmApiKey: storedProvider,
      clusteringLlmApiKey: storedProvider,
    },
  });
  const slot = (connection: StoredConnection, model: string | null) =>
    connection && model ? { provider: connection.provider, model } : null;
  return {
    summary: slot(row?.summaryLlmApiKey ?? null, row?.summaryModel ?? null),
    embedding: slot(
      row?.embeddingLlmApiKey ?? null,
      row?.embeddingModel ?? null,
    ),
    embeddingDimensions: row?.embeddingDimensions ?? 1024,
    clustering: slot(
      row?.clusteringLlmApiKey ?? null,
      row?.clusteringModel ?? null,
    ),
    enabled: row ? row.enabled : null,
    blockedAt: row?.blockedAt ?? null,
    blockReason: row?.blockReason ?? null,
    blockMessage: row?.blockMessage ?? null,
  };
}

/** Resolves each slot's provider to the project's effective connection, or throws. */
async function resolveModelSettings(
  projectId: string,
  settings: TopicsModelSettings,
): Promise<{ settings: ResolvedModelSettings; keys: LlmApiKeys[] }> {
  const candidates = await findProjectLlmApiKeyCandidates({ projectId });
  const keys: LlmApiKeys[] = [];
  const slot = (
    requested: TopicsModelSettings[TopicsModelSlotName],
  ): ConnectionSlot => {
    if (!requested) return null;
    const key = effectiveConnection(candidates, requested.provider);
    if (!key)
      throw new InvalidRequestError(
        "LLM connection not found in this project.",
      );
    keys.push(key);
    return { llmApiKeyId: key.id, model: requested.model };
  };
  return {
    settings: {
      summary: slot(settings.summary),
      embedding: slot(settings.embedding),
      embeddingDimensions: settings.embeddingDimensions,
      clustering: slot(settings.clustering),
    },
    keys,
  };
}

/** Real call per configured slot. The message is the provider error for that row. */
export async function checkTopicsModelSettings(
  projectId: string,
  settings: TopicsModelSettings,
): Promise<Partial<Record<TopicsModelSlotName, string>>> {
  const resolved = await resolveModelSettings(projectId, settings);
  return testTopicsModelSlots(resolved.settings, resolved.keys);
}

/**
 * Validates and tests the settings without writing them, so callers can save
 * related configuration first and commit the models last. Saving keeps the
 * stored automatic-processing state and pause; a first save starts off.
 */
export async function prepareTopicsModelSettings(
  projectId: string,
  settings: TopicsModelSettings,
) {
  const { settings: resolved, keys } = await resolveModelSettings(
    projectId,
    settings,
  );
  const current = await prisma.topicConfig.findUnique({
    where: { projectId },
  });
  const running = current?.enabled ?? false;
  if (
    running &&
    (!settings.summary || !settings.embedding || !settings.clustering)
  )
    throw new InvalidRequestError(
      "Choose a summary, embedding, and clustering model while automatic processing is on, or turn it off first.",
    );

  const slots = resolveSavedSlots(resolved, current);
  const embeddingChanged =
    current?.embeddingModel &&
    (slots.embedding.model !== current.embeddingModel ||
      slots.embeddingDimensions !== current.embeddingDimensions);
  if (embeddingChanged && (await hasTopicEmbeddings(projectId)))
    throw new InvalidRequestError(
      "The embedding model and dimensions cannot change after summaries were embedded; existing vectors could no longer be clustered together.",
    );

  // Only changed models are tested: the dialog tests each pick, turning
  // processing on tests all three, and a broken stored connection pauses Topics.
  await testTopicsModels(changedSlots(resolved, current), keys);

  const data = {
    summaryLlmApiKeyId: slots.summary.llmApiKeyId,
    summaryModel: slots.summary.model,
    embeddingLlmApiKeyId: slots.embedding.llmApiKeyId,
    embeddingModel: slots.embedding.model,
    embeddingDimensions: slots.embeddingDimensions,
    clusteringLlmApiKeyId: slots.clustering.llmApiKeyId,
    clusteringModel: slots.clustering.model,
  };
  return data;
}

type StoredTopicConfig = Awaited<
  ReturnType<typeof prisma.topicConfig.findUnique>
>;

/**
 * The slots to store. Saving with automatic processing off keeps the stored
 * model of every slot that arrives empty, for example after its connection was
 * deleted, so saving never discards a model.
 */
function resolveSavedSlots(
  settings: ResolvedModelSettings,
  current: StoredTopicConfig,
) {
  const keep = current && !current.enabled ? current : null;
  const slot = (
    name: TopicsModelSlotName,
    stored: { llmApiKeyId: string | null; model: string | null },
  ) => {
    const requested = settings[name];
    if (requested) return requested;
    return keep ? stored : { llmApiKeyId: null, model: null };
  };
  return {
    summary: slot("summary", {
      llmApiKeyId: current?.summaryLlmApiKeyId ?? null,
      model: current?.summaryModel ?? null,
    }),
    embedding: slot("embedding", {
      llmApiKeyId: current?.embeddingLlmApiKeyId ?? null,
      model: current?.embeddingModel ?? null,
    }),
    embeddingDimensions:
      keep && !settings.embedding
        ? keep.embeddingDimensions
        : settings.embeddingDimensions,
    clustering: slot("clustering", {
      llmApiKeyId: current?.clusteringLlmApiKeyId ?? null,
      model: current?.clusteringModel ?? null,
    }),
  };
}

function changedSlots(
  settings: ResolvedModelSettings,
  current: StoredTopicConfig,
): ResolvedModelSettings {
  const changed = (
    slot: ConnectionSlot,
    llmApiKeyId: string | null | undefined,
    model: string | null | undefined,
    extraChange = false,
  ) =>
    slot &&
    (extraChange || slot.llmApiKeyId !== llmApiKeyId || slot.model !== model)
      ? slot
      : null;
  return {
    ...settings,
    summary: changed(
      settings.summary,
      current?.summaryLlmApiKeyId,
      current?.summaryModel,
    ),
    embedding: changed(
      settings.embedding,
      current?.embeddingLlmApiKeyId,
      current?.embeddingModel,
      settings.embeddingDimensions !== current?.embeddingDimensions,
    ),
    clustering: changed(
      settings.clustering,
      current?.clusteringLlmApiKeyId,
      current?.clusteringModel,
    ),
  };
}

/**
 * Requires all three stored models before automatic processing is turned on,
 * and tests them with real calls after a pause.
 */
export async function checkStoredTopicsModels(
  config: NonNullable<StoredTopicConfig>,
): Promise<void> {
  const stored = await readTopicsModelSettings(config.projectId);
  if (!stored.summary || !stored.embedding || !stored.clustering)
    throw new InvalidRequestError(
      "Choose a summary, embedding, and clustering model in Configure Topics before turning on automatic processing.",
    );
  // Saved models were tested on save; a pause means a connection failed since.
  if (!config.blockedAt) return;
  const resolved = await resolveModelSettings(config.projectId, stored);
  await testTopicsModels(resolved.settings, resolved.keys);
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
  settings: ResolvedModelSettings,
  keys: LlmApiKeys[],
): Promise<Partial<Record<TopicsModelSlotName, string>>> {
  const errors: Partial<Record<TopicsModelSlotName, string>> = {};
  await Promise.all(
    TOPICS_MODEL_SLOTS.map(async (name) => {
      const slot = settings[name];
      if (!slot) return;
      const llmApiKey = keys.find(
        (candidate) => candidate.id === slot.llmApiKeyId,
      );
      if (!llmApiKey) {
        errors[name] = "LLM connection not found in this project.";
        return;
      }
      try {
        const resolved = resolveSlot(name, llmApiKey, slot.model);
        if (!resolved) {
          errors[name] = "LLM connection not found in this project.";
          return;
        }
        if (name !== "embedding") {
          const schema: z.ZodType = TEST_SCHEMAS[name];
          const result = await generateTopicText({
            model: resolved,
            system: [
              {
                text: "Return a brief example matching the schema.",
                cache: true,
              },
            ],
            input: "The user needs help signing in.",
            schema,
            maxOutputTokens: 512,
            timeoutMs: getClientInitiatedNonStreamingLlmTimeoutMs(),
          });
          schema.parse(result.output);
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
  settings: ResolvedModelSettings,
  keys: LlmApiKeys[],
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
