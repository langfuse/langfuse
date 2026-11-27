import { useRef, useState, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { env } from "@/src/env.mjs";
import { type JudgeModel } from "@/src/features/evals/v2/judgeModel";
import { api } from "@/src/utils/api";
import { getEvaluatorBlockMetadata } from "@langfuse/shared";
import {
  topicsModelSettingsSchema,
  type TopicsModelSlotName,
} from "@langfuse/shared/topics";
import {
  ConfigureTopicsDialog,
  type ConfigureTopicsSaveDraft,
  type TopicSlotCheck,
} from "./ConfigureTopicsDialog";
import { type ConfigureTopicsSettingsInput } from "./useTopicSettings";
import { topicsSetupPayload } from "./topics-setup";
import { resolveTopicModelSlot, topicModelsFor } from "./topic-setup-flow";

type ConfigureTopicsDialogControllerProps = {
  projectId: string;
  settings: ConfigureTopicsSettingsInput | null;
  children: (control: { openDialog: () => void }) => ReactNode;
};

/**
 * Owns the Topics Settings dialog. Wrap the shared parent and pass
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
  ruleCount,
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
  // Fetched on every open: the first summary can be embedded while the page
  // stays open. The server still rejects a change, so a failed read only hides
  // the warning.
  const hasEmbeddings = api.topics.hasCurrentEmbeddings.useQuery({ projectId });
  const utils = api.useUtils();
  const turnOn = api.topics.setAutomaticProcessing.useMutation({
    onSuccess: () => utils.topics.modelSettings.invalidate({ projectId }),
  });
  const providerGroups = connections.map<[string, string[]]>((connection) => [
    connection.provider,
    topicModelsFor(connection, "chat"),
  ]);
  const embeddingGroups = connections
    .map<[string, string[]]>((connection) => [
      connection.provider,
      topicModelsFor(
        connection,
        "embedding",
        stored.embedding?.provider === connection.provider
          ? stored.embedding.model
          : null,
      ),
    ])
    .filter(([, models]) => models.length > 0);
  const draft = {
    summary: stored.summary,
    embedding: stored.embedding,
    embeddingDimensions: String(stored.embeddingDimensions),
    clustering: stored.clustering,
    idleSeconds: String((traceIdleMs ?? 600_000) / 1000),
    hasEmbeddings: hasEmbeddings.data ?? false,
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
    const value = resolveTopicModelSlot(
      model,
      connections,
      slot === "embedding" ? "embedding" : "chat",
      slot === "embedding" ? stored.embedding : null,
    );
    if (!value) {
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
    const summary = resolveTopicModelSlot(value.summary, connections, "chat");
    const embedding = resolveTopicModelSlot(
      value.embedding,
      connections,
      "embedding",
      stored.embedding,
    );
    const clustering = resolveTopicModelSlot(
      value.clustering,
      connections,
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
      automaticProcessingOff={
        ruleCount > 0 && stored.enabled === false && canWrite
          ? {
              onTurnOn: () => turnOn.mutate({ projectId, enabled: true }),
              pending: turnOn.isPending,
            }
          : undefined
      }
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
      utils.topics.tracingReadinessSettings.invalidate({ projectId });
    },
  });
}
