import { useEffect, useState, type ReactNode } from "react";
import { type FilterState } from "@langfuse/shared";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { env } from "@/src/env.mjs";
import { type JudgeModel } from "@/src/features/evals/v2/judgeModel";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import { type ConfigureTopicsSettingsInput } from "./TopicModelSettings";
import {
  TopicSetupFlowDialog,
  type TopicSetupPastCount,
} from "./TopicSetupFlowDialog";
import {
  TOPIC_SETUP_BACKFILL_DAYS,
  TOPIC_SETUP_BACKFILL_LIMIT,
  followsTopicRecommendations,
  initialTopicSetupDraft,
  resolveTopicModelSlot,
  topicConnectionCaption,
  topicProviderGroups,
  type TopicSetupConnection,
  type TopicSetupDraft,
  type TopicSetupQuestion,
} from "./topic-setup-flow";

export function TopicSetupFlowController({
  canWrite,
  children,
  onSaveSampling,
  projectId,
  settings,
}: {
  projectId: string;
  canWrite: boolean;
  settings: ConfigureTopicsSettingsInput | null;
  onSaveSampling: (input: {
    enabled: boolean;
    sampling: number;
  }) => Promise<unknown>;
  children: (control: { openSetup: () => void }) => ReactNode;
}) {
  // Opens only from Start analyzing, never on its own, so the landing shows first.
  const [open, setOpen] = useState(false);
  function openSetup() {
    setOpen(true);
  }
  function closeSetup() {
    setOpen(false);
  }
  return (
    <>
      {children({ openSetup })}
      {open && settings ? (
        <DialogController<null>
          initialState={() => null}
          onDismiss={closeSetup}
          renderDialog={({ closeDialog }) => (
            <TopicSetupSession
              // Rebuilds the draft with recommended models once the first connection arrives.
              key={settings.connections.length > 0 ? "ready" : "none"}
              projectId={projectId}
              canWrite={canWrite}
              settings={settings}
              onSaveSampling={onSaveSampling}
              closeDialog={closeDialog}
            />
          )}
        >
          {() => null}
        </DialogController>
      ) : null}
    </>
  );
}

function TopicSetupSession({
  canWrite,
  closeDialog,
  onSaveSampling,
  projectId,
  settings,
}: {
  projectId: string;
  canWrite: boolean;
  settings: ConfigureTopicsSettingsInput;
  onSaveSampling: (input: {
    enabled: boolean;
    sampling: number;
  }) => Promise<unknown>;
  closeDialog: () => void;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const canAddConnection = useHasProjectAccess({
    projectId,
    scope: "llmApiKeys:create",
  });
  // A connection added in another tab shows up when this tab regains focus.
  useEffect(() => {
    const refetch = () => {
      if (document.visibilityState === "visible")
        utils.llmApiKey.effective.invalidate({ projectId });
    };
    window.addEventListener("focus", refetch);
    document.addEventListener("visibilitychange", refetch);
    return () => {
      window.removeEventListener("focus", refetch);
      document.removeEventListener("visibilitychange", refetch);
    };
  }, [utils, projectId]);
  const save = api.topics.saveSetup.useMutation({
    onSuccess: () => {
      utils.topics.modelSettings.invalidate({ projectId });
      utils.topics.facets.invalidate({ projectId });
      utils.topics.rules.invalidate({ projectId });
      utils.topics.tracingReadinessSettings.invalidate({ projectId });
    },
  });
  const startSetup = api.topics.startSetup.useMutation();
  const connectionSettingsUrl = `${window.location.origin}${env.NEXT_PUBLIC_BASE_PATH ?? ""}/project/${projectId}/settings/llm-connections`;
  const connections = settings.connections.map(
    (connection): TopicSetupConnection => ({
      id: connection.id,
      provider: connection.provider,
      adapter: connection.adapter,
      customModels: connection.customModels,
      withDefaultModels: connection.withDefaultModels,
    }),
  );
  const [draft, setDraft] = useState(() =>
    initialTopicSetupDraft({
      stored: settings.stored,
      connections,
      facets: settings.facets,
      enabledFacetIds: settings.rule ? new Set(settings.rule.facetIds) : null,
      traceIdleMs: settings.traceIdleMs,
    }),
  );
  const [error, setError] = useState<string | null>(null);
  // One request per session, so a repeated Start resolves to the same backfill.
  const [requestId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  useEffect(() => {
    capture("topics:setup_opened", { source: "start_analyzing" });
  }, [capture]);
  // Counted once per step 2 visit; the slider only rescales the result.
  const counts = api.topics.setupTraceCounts.useQuery(
    { projectId },
    { enabled: draft.step !== "questions", retry: false },
  );
  const pastCount = pastTraceCount(
    counts.data,
    draft.samplePercent,
    counts.error?.message ?? null,
    counts.isFetching,
  );

  async function saveQuestions() {
    const summary = resolveTopicModelSlot(
      draft.summary,
      connections,
      settings.stored.summary?.llmApiKeyId,
      "chat",
    );
    const embedding = resolveTopicModelSlot(
      draft.embedding,
      connections,
      settings.stored.embedding?.llmApiKeyId,
      "embedding",
      settings.stored.embedding?.model,
    );
    const clustering = resolveTopicModelSlot(
      draft.clustering,
      connections,
      settings.stored.clustering?.llmApiKeyId,
      "chat",
    );
    if (!summary || !embedding || !clustering)
      throw new Error("Choose a model from a connection in this project.");
    const filter: FilterState = [];
    await save.mutateAsync({
      projectId,
      summary,
      embedding,
      embeddingDimensions: settings.stored.embeddingDimensions,
      clustering,
      facets: draft.questions.map((question) => ({
        name: question.name,
        enabled: question.enabled,
      })),
      customFacetIds: settings.facets.flatMap((facet) =>
        !facet.isBuiltIn && settings.rule?.facetIds.includes(facet.id)
          ? [facet.id]
          : [],
      ),
      filter,
      traceIdleMs: draft.waitMinutes * 60_000,
      ...(settings.rule ? { ruleId: settings.rule.id } : {}),
    });
    capture("topics:setup_step_saved", {
      step: "questions",
      questionCount: draft.questions.filter((question) => question.enabled)
        .length,
      followsRecommendation: followsTopicRecommendations(draft),
      waitMinutes: draft.waitMinutes,
    });
  }

  async function persistSampling(enabled: boolean) {
    await onSaveSampling({
      enabled,
      sampling: draft.samplePercent / 100,
    });
  }

  async function startAnalyzing() {
    await persistSampling(true);
    const facets = await utils.topics.facets.fetch({ projectId });
    const enabled = new Set<string>(
      draft.questions
        .filter((question) => question.enabled)
        .map((question) => question.name),
    );
    const refs = facets.flatMap((facet) => {
      const version = facet.versions[0]?.version;
      if (!facet.isBuiltIn || !enabled.has(facet.name) || !version) return [];
      return [{ facetId: facet.id, version }];
    });
    if (refs.length === 0)
      throw new Error("Save at least one question before starting.");
    const { traceCount: backfillCount } = await startSetup.mutateAsync({
      projectId,
      requestId,
      sampling: draft.samplePercent / 100,
      facets: refs,
    });
    await utils.topics.executions.invalidate({ projectId });
    capture("topics:setup_started", {
      backfillCount,
      samplePercent: draft.samplePercent,
    });
    closeDialog();
  }

  async function handleNext() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (draft.step === "questions") {
        await saveQuestions();
        setDraft((current) => ({ ...current, step: "traces" }));
        return;
      }
      if (draft.step === "traces") {
        await persistSampling(false);
        capture("topics:setup_step_saved", {
          step: "traces",
          samplePercent: draft.samplePercent,
        });
        setDraft((current) => ({ ...current, step: "review" }));
        return;
      }
      await startAnalyzing();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save Topics.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <TopicSetupFlowDialog
      step={draft.step}
      busy={pending}
      canWrite={canWrite}
      error={error}
      questions={draft.questions}
      summary={draft.summary}
      embedding={draft.embedding}
      clustering={draft.clustering}
      providerGroups={topicProviderGroups(
        connections,
        "chat",
        settings.stored.summary?.model,
      )}
      embeddingProviderGroups={topicProviderGroups(
        connections,
        "embedding",
        settings.stored.embedding?.model,
      )}
      connectionCaption={topicConnectionCaption(connections)}
      hasConnection={connections.length > 0}
      canAddConnection={canAddConnection}
      advancedOpen={draft.advancedOpen}
      waitMinutes={draft.waitMinutes}
      samplePercent={draft.samplePercent}
      pastCount={pastCount}
      projectId={projectId}
      onQuestionEnabled={(name, enabled) =>
        setDraft((current) => ({
          ...current,
          questions: setQuestionEnabled(current.questions, name, enabled),
        }))
      }
      onSummaryChange={(model) => updateModel(setDraft, "summary", model)}
      onEmbeddingChange={(model) => updateModel(setDraft, "embedding", model)}
      onClusteringChange={(model) => updateModel(setDraft, "clustering", model)}
      onConfigureProviders={() => {
        window.open(connectionSettingsUrl, "_blank", "noopener,noreferrer");
      }}
      connectionSettingsUrl={connectionSettingsUrl}
      onAdvancedOpenChange={(advancedOpen) =>
        setDraft((current) => ({ ...current, advancedOpen }))
      }
      onWaitMinutesChange={(waitMinutes) =>
        setDraft((current) => ({ ...current, waitMinutes }))
      }
      onSamplePercentChange={(samplePercent) =>
        setDraft((current) => ({ ...current, samplePercent }))
      }
      onEdit={(step) => setDraft((current) => ({ ...current, step }))}
      onBack={() =>
        setDraft((current) => ({
          ...current,
          step: current.step === "review" ? "traces" : "questions",
        }))
      }
      onNext={() => {
        handleNext().catch(() => undefined);
      }}
    />
  );
}

function pastTraceCount(
  counts: { finished1d: number; finished7d: number } | undefined,
  samplePercent: number,
  error: string | null,
  fetching: boolean,
): TopicSetupPastCount {
  if (counts) {
    // Mirrors the server: 1 day when it fills the batch, else 7 days.
    const rate = samplePercent / 100;
    const window =
      counts.finished1d * rate >= TOPIC_SETUP_BACKFILL_LIMIT
        ? { days: 1, count: counts.finished1d }
        : { days: TOPIC_SETUP_BACKFILL_DAYS, count: counts.finished7d };
    return {
      status: "ready",
      days: window.days,
      matched: Math.min(
        TOPIC_SETUP_BACKFILL_LIMIT,
        Math.round(window.count * rate),
      ),
      dailyTraces: counts.finished7d / TOPIC_SETUP_BACKFILL_DAYS,
    };
  }
  if (error && !fetching) return { status: "error", message: error };
  return { status: "loading" };
}

function setQuestionEnabled(
  questions: TopicSetupQuestion[],
  name: TopicSetupQuestion["name"],
  enabled: boolean,
) {
  return questions.map((question) =>
    question.name === name ? { ...question, enabled } : question,
  );
}

function updateModel(
  setDraft: (update: (current: TopicSetupDraft) => TopicSetupDraft) => void,
  slot: "summary" | "embedding" | "clustering",
  model: JudgeModel,
) {
  setDraft((current) => ({ ...current, [slot]: model }));
}
