import { useRef, useState, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
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
  type TopicsModelSlotName,
} from "@langfuse/shared/topics";
import {
  ConfigureTopicsDialog,
  type ConfigureTopicsSaveDraft,
  type TopicSlotCheck,
} from "./ConfigureTopicsDialog";
import { type ConfigureTopicsSettingsInput } from "./TopicModelSettings";
import { topicsSetupPayload } from "./topics-setup";

type Connection = RouterOutputs["llmApiKey"]["effective"]["data"][number];
type SlotValue = { llmApiKeyId: string; model: string } | null;

type ConfigureTopicsDialogControllerProps = {
  projectId: string;
  settings: ConfigureTopicsSettingsInput | null;
  children: (control: { openDialog: () => void }) => ReactNode;
};

/**
 * Owns the Configure Topics dialog. Wrap the shared parent and pass
 * `openDialog` to every opener, e.g. the header button and the setup screen.
 * Openers stay disabled until `settings` has loaded. The save request outlives
 * a close, so a reopened dialog cannot start an overlapping save.
 */
export function ConfigureTopicsDialogController({
  projectId,
  settings,
  children,
}: ConfigureTopicsDialogControllerProps) {
  const save = useSaveTopicsSetup(projectId);
  return (
    <DialogController
      renderDialog={({ closeDialog }) =>
        settings ? (
          <ConfigureTopicsSettings
            {...settings}
            save={save}
            closeDialog={closeDialog}
          />
        ) : null
      }
    >
      {({ openDialog }) => {
        function openConfigureDialog() {
          openDialog();
        }
        return children({ openDialog: openConfigureDialog });
      }}
    </DialogController>
  );
}

function ConfigureTopicsSettings({
  projectId,
  canWrite,
  stored,
  traceIdleMs,
  connections,
  facets,
  rule,
  save,
  closeDialog,
}: ConfigureTopicsSettingsInput & {
  save: ReturnType<typeof useSaveTopicsSetup>;
  closeDialog: () => void;
}) {
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
    filters: [],
    idleSeconds: String((traceIdleMs ?? 600_000) / 1000),
    embeddingLocked: false,
    automaticProcessing: stored.enabled ?? false,
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
    if (stored.enabled && (!summary || !embedding || !clustering))
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
      providerGroups={providerGroups}
      embeddingProviderGroups={embeddingGroups}
      draft={draft}
      closeDialog={closeDialog}
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
      {...(paused
        ? { notice: "paused" as const, ...paused }
        : { notice: "none" as const })}
    />
  );
}

function useSaveTopicsSetup(projectId: string) {
  const utils = api.useUtils();
  return api.topics.saveSetup.useMutation({
    onSuccess: () => {
      utils.topics.modelSettings.invalidate({ projectId });
      utils.topics.facets.invalidate({ projectId });
      utils.topics.rules.invalidate({ projectId });
      utils.topics.tracingReadinessSettings.invalidate({ projectId });
    },
  });
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
  const builtInsByName = new Map(
    facets
      .filter((facet) => facet.isBuiltIn)
      .map((facet) => [facet.name, facet]),
  );
  const builtIn = DEFAULT_TOPIC_FACETS.map((preset) => {
    const existing = builtInsByName.get(preset.name);
    return {
      id: existing?.id ?? preset.name,
      name: preset.name,
      description: existing?.description || preset.description,
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
        description: facet.description,
        question,
        builtIn: false,
        enabled: enabledIds?.has(facet.id) ?? false,
      },
    ];
  });
  return [...builtIn, ...custom];
}

export const __test = { facetDrafts };
