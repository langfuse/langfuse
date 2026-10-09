import { useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { env } from "@/src/env.mjs";
import { type JudgeModel } from "@/src/features/evals/v2/judgeModel";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  getEvaluatorBlockMetadata,
  LLMAdapter,
  supportedModels,
} from "@langfuse/shared";
import {
  DEFAULT_TOPIC_FACETS,
  topicsModelSettingsSchema,
  type TopicFacet,
  type TopicRule,
  type TopicsModelSlotName,
} from "@langfuse/shared/topics";
import {
  ConfigureTopicsDialog,
  type ConfigureTopicsSaveDraft,
  type TopicSlotCheck,
} from "./ConfigureTopicsDialog";
import { topicsSetupPayload } from "./topics-setup";

type StoredSettings = RouterOutputs["topics"]["modelSettings"];
type Connection = RouterOutputs["llmApiKey"]["all"]["data"][number];
type SlotValue = { llmApiKeyId: string; model: string } | null;

/** Topics setup: one sheet for models, facets, and which traces to include. */
export function useTopicModelSettings({
  projectId,
  canWrite,
  facets,
  facetsReady,
}: {
  projectId: string;
  canWrite: boolean;
  facets: TopicFacet[];
  facetsReady: boolean;
}) {
  const settings = api.topics.modelSettings.useQuery({ projectId });
  const rules = api.topics.rules.useQuery({ projectId });
  const connections = api.llmApiKey.all.useQuery({ projectId });
  const configured = Boolean(
    settings.data?.summary &&
    settings.data.embedding &&
    settings.data.clustering,
  );

  let notice = null;
  if (settings.data?.blockMessage)
    notice = (
      <Alert variant="warning">
        <Alert.Title>Automatic Topics processing is paused</Alert.Title>
        <Alert.Description>
          <p className="break-words">{settings.data.blockMessage}</p>
        </Alert.Description>
      </Alert>
    );
  else if (settings.data && !configured)
    notice = (
      <Alert variant="info">
        <Alert.Title>Choose the models Topics runs on</Alert.Title>
        <Alert.Description>
          <p>
            Topics uses your LLM connections for three jobs: facet summaries,
            embeddings, and topic clustering. Open Configure Topics to set all
            three.
          </p>
        </Alert.Description>
      </Alert>
    );

  const ready = Boolean(
    settings.data && connections.data && rules.isSuccess && facetsReady,
  );
  const rule = rules.data?.length === 1 ? rules.data[0] : null;
  const action = ready ? (
    <ConfigureTopicsSettings
      key={`${settings.dataUpdatedAt}-${rules.dataUpdatedAt}`}
      projectId={projectId}
      canWrite={canWrite}
      stored={settings.data!}
      connections={connections.data!.data}
      facets={facets}
      rule={rule}
    />
  ) : (
    <ConfigureTopicsDialog
      projectId={projectId}
      providerGroups={[]}
      draft={{
        summary: null,
        embedding: null,
        embeddingDimensions: "1024",
        clustering: null,
        facets: [],
        filters: [],
        sampling: 1,
        idleSeconds: "600",
        embeddingLocked: false,
      }}
      defaultOpen={false}
      defaultTestOpen={false}
      onConfigureProviders={() => undefined}
      onSave={() => undefined}
      canWrite={false}
      triggerVariant="secondary"
      notice="none"
    />
  );

  return { action, notice };
}

function ConfigureTopicsSettings({
  projectId,
  canWrite,
  stored,
  connections,
  facets,
  rule,
}: {
  projectId: string;
  canWrite: boolean;
  stored: StoredSettings;
  connections: Connection[];
  facets: TopicFacet[];
  rule: TopicRule | null;
}) {
  const utils = api.useUtils();
  const requests = useRef({ summary: 0, embedding: 0, clustering: 0 });
  const [checks, setChecks] = useState<
    Record<TopicsModelSlotName, TopicSlotCheck>
  >(() => ({
    summary: stored.summary ? { status: "ok" } : { status: "idle" },
    embedding: stored.embedding ? { status: "ok" } : { status: "idle" },
    clustering: stored.clustering ? { status: "ok" } : { status: "idle" },
  }));
  const [saveError, setSaveError] = useState<string | null>(null);
  const test = api.topics.testModelSettings.useMutation();
  const save = api.topics.saveSetup.useMutation({
    onSuccess: () => {
      utils.topics.modelSettings.invalidate({ projectId });
      utils.topics.facets.invalidate({ projectId });
      utils.topics.rules.invalidate({ projectId });
    },
  });
  const providerGroups = connections.map<[string, string[]]>((connection) => [
    connection.provider,
    modelsFor(connection, "chat"),
  ]);
  const embeddingGroups = connections.map<[string, string[]]>((connection) => [
    connection.provider,
    modelsFor(
      connection,
      "embedding",
      stored.embedding?.llmApiKeyId === connection.id
        ? stored.embedding.model
        : null,
    ),
  ]);
  const draft = {
    summary: judgeModel(stored.summary, connections),
    embedding: judgeModel(stored.embedding, connections),
    embeddingDimensions: String(stored.embeddingDimensions),
    clustering: judgeModel(stored.clustering, connections),
    facets: facetDrafts(facets, rule ? new Set(rule.facetIds) : null),
    filters: rule?.filter ?? [],
    sampling: rule?.sampling ?? 1,
    idleSeconds:
      rule?.idleTimeMs != null ? String(rule.idleTimeMs / 1000) : "600",
    embeddingLocked: false,
  };
  const paused = stored.blockMessage
    ? {
        shortLabel: stored.blockReason
          ? getEvaluatorBlockMetadata(stored.blockReason).shortLabel
          : "Paused",
        pausedAgo: stored.blockedAt
          ? formatDistanceToNow(new Date(stored.blockedAt), { addSuffix: true })
          : "just now",
        message: stored.blockMessage,
      }
    : null;

  const commitSlot = (
    slot: TopicsModelSlotName,
    model: JudgeModel,
    dimensions: string,
  ) => {
    const parsedDimensions =
      topicsModelSettingsSchema.shape.embeddingDimensions.safeParse(
        Number(dimensions),
      );
    if (slot === "embedding" && !parsedDimensions.success) {
      setChecks((current) => ({
        ...current,
        embedding: {
          status: "error",
          message: parsedDimensions.error.issues[0]?.message,
        },
      }));
      return;
    }
    const preferred = {
      summary: stored.summary?.llmApiKeyId,
      embedding: stored.embedding?.llmApiKeyId,
      clustering: stored.clustering?.llmApiKeyId,
    }[slot];
    const llmApiKeyId = connectionId(
      model,
      connections,
      preferred,
      slot === "embedding" ? "embedding" : "chat",
      slot === "embedding" ? stored.embedding?.model : null,
    );
    if (!llmApiKeyId) {
      setChecks((current) => ({
        ...current,
        [slot]: {
          status: "error",
          message: "Choose a model from a connection in this project.",
        },
      }));
      return;
    }
    const request = ++requests.current[slot];
    setChecks((current) => ({ ...current, [slot]: { status: "testing" } }));
    const value = { llmApiKeyId, model: model.model };
    test
      .mutateAsync({
        projectId,
        summary: slot === "summary" ? value : null,
        embedding: slot === "embedding" ? value : null,
        embeddingDimensions: parsedDimensions.success
          ? parsedDimensions.data
          : stored.embeddingDimensions,
        clustering: slot === "clustering" ? value : null,
        enabled: false,
      })
      .then((errors) => {
        if (requests.current[slot] !== request) return;
        const message = errors[slot];
        setChecks((current) => ({
          ...current,
          [slot]: message ? { status: "error", message } : { status: "ok" },
        }));
      })
      .catch((error: unknown) => {
        if (requests.current[slot] !== request) return;
        setChecks((current) => ({
          ...current,
          [slot]: {
            status: "error",
            message:
              error instanceof Error ? error.message : "The test call failed.",
          },
        }));
      });
  };

  const onSave = async (value: ConfigureTopicsSaveDraft) => {
    setSaveError(null);
    const parsedDimensions =
      topicsModelSettingsSchema.shape.embeddingDimensions.safeParse(
        Number(value.embeddingDimensions),
      );
    if (!parsedDimensions.success)
      throw new Error(
        parsedDimensions.error.issues[0]?.message ??
          "Check the embedding dimensions.",
      );
    const summary = slotValue(
      value.summary,
      connections,
      stored.summary?.llmApiKeyId,
      "chat",
    );
    const embedding = slotValue(
      value.embedding,
      connections,
      stored.embedding?.llmApiKeyId,
      "embedding",
      stored.embedding?.model,
    );
    const clustering = slotValue(
      value.clustering,
      connections,
      stored.clustering?.llmApiKeyId,
      "chat",
    );
    if (!summary || !embedding || !clustering)
      throw new Error("Choose a model from a connection in this project.");
    try {
      await save.mutateAsync({
        projectId,
        ...topicsSetupPayload(value, {
          summary,
          embedding,
          embeddingDimensions: parsedDimensions.data,
          clustering,
        }),
        ruleId: rule?.id,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save Topics.";
      setSaveError(message);
      throw error;
    }
  };

  return (
    <ConfigureTopicsDialog
      projectId={projectId}
      providerGroups={providerGroups}
      embeddingProviderGroups={embeddingGroups}
      draft={draft}
      defaultOpen={false}
      defaultTestOpen={false}
      canWrite={canWrite}
      saving={save.isPending}
      saveError={saveError}
      slotChecks={checks}
      onSlotCommit={commitSlot}
      onConfigureProviders={() => {
        window.open(
          `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/project/${projectId}/settings/llm-connections`,
          "_blank",
          "noopener,noreferrer",
        );
      }}
      onSave={onSave}
      triggerVariant={configured(stored) ? "secondary" : "primary"}
      {...(paused
        ? { notice: "paused" as const, ...paused }
        : { notice: "none" as const })}
    />
  );
}

function configured(stored: StoredSettings) {
  return Boolean(stored.summary && stored.embedding && stored.clustering);
}

const OPENAI_EMBEDDING_MODELS = [
  "text-embedding-3-small",
  "text-embedding-3-large",
  "text-embedding-ada-002",
];

const GOOGLE_EMBEDDING_MODELS = [
  "textembedding-gecko",
  "textembedding-gecko-multilingual",
];

function embeddingModelsFor(adapter: string) {
  if (adapter === LLMAdapter.OpenAI || adapter === LLMAdapter.Azure)
    return OPENAI_EMBEDDING_MODELS;
  if (adapter === LLMAdapter.GoogleAIStudio || adapter === LLMAdapter.VertexAI)
    return GOOGLE_EMBEDDING_MODELS;
  return [];
}

function modelsFor(
  connection: Connection,
  kind: "chat" | "embedding",
  savedModel?: string | null,
) {
  const chat = connection.withDefaultModels
    ? (supportedModels[connection.adapter as keyof typeof supportedModels] ??
      [])
    : [];
  const embedding =
    kind === "embedding" && connection.withDefaultModels
      ? embeddingModelsFor(connection.adapter)
      : [];
  return Array.from(
    new Set(
      [savedModel, ...embedding, ...connection.customModels, ...chat].filter(
        (model): model is string => Boolean(model),
      ),
    ),
  );
}

function judgeModel(
  slot: SlotValue,
  connections: Connection[],
): JudgeModel | null {
  if (!slot) return null;
  const connection = connections.find((item) => item.id === slot.llmApiKeyId);
  return {
    provider: connection?.provider ?? "Missing connection",
    model: slot.model,
  };
}

function connectionId(
  model: JudgeModel,
  connections: Connection[],
  preferredId: string | undefined,
  kind: "chat" | "embedding",
  savedModel?: string | null,
) {
  const matches = connections.filter(
    (connection) =>
      connection.provider === model.provider &&
      modelsFor(
        connection,
        kind,
        connection.id === preferredId ? savedModel : null,
      ).includes(model.model),
  );
  return (
    matches.find((connection) => connection.id === preferredId)?.id ??
    matches[0]?.id ??
    null
  );
}

function slotValue(
  model: JudgeModel | null,
  connections: Connection[],
  preferredId: string | undefined,
  kind: "chat" | "embedding",
  savedModel?: string | null,
) {
  if (!model) return null;
  const llmApiKeyId = connectionId(
    model,
    connections,
    preferredId,
    kind,
    savedModel,
  );
  return llmApiKeyId ? { llmApiKeyId, model: model.model } : null;
}

function facetDrafts(
  facets: TopicFacet[],
  enabledIds: ReadonlySet<string> | null,
) {
  const byName = new Map(facets.map((facet) => [facet.name, facet]));
  const builtIn = DEFAULT_TOPIC_FACETS.map((preset) => {
    const existing = byName.get(preset.name);
    return {
      id: existing?.id ?? preset.name,
      name: preset.name,
      question: existing?.versions[0]?.prompt ?? preset.prompt,
      builtIn: true,
      enabled: enabledIds
        ? Boolean(existing && enabledIds.has(existing.id))
        : true,
    };
  });
  const custom = facets.flatMap((facet) => {
    if (facet.isBuiltIn) return [];
    const question = facet.versions[0]?.prompt;
    if (!question) return [];
    return [
      {
        id: facet.id,
        name: facet.name,
        question,
        builtIn: false,
        enabled: enabledIds?.has(facet.id) ?? false,
      },
    ];
  });
  return [...builtIn, ...custom];
}
