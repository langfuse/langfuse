import { useEffect, useState, type ReactNode } from "react";
import type { FilterState } from "@langfuse/shared";
import { topicRuleFilterError } from "@langfuse/shared/topics";
import { useTopicTraceFilter } from "./useTopicTraceFilter";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { env } from "@/src/env.mjs";
import { type JudgeModel } from "@/src/features/evals/v2/judgeModel";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { type ConfigureTopicsSettingsInput } from "./useTopicSettings";
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
    ruleId?: string;
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
    ruleId?: string;
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
      // The page follows the first rule's setup from the maps overview.
      utils.topics.maps.invalidate({ projectId });
      utils.topics.tracingReadinessSettings.invalidate({ projectId });
    },
  });
  const startRuleSetup = api.topics.startRuleSetup.useMutation({
    onSuccess: () => utils.topics.ruleSetupStatus.invalidate({ projectId }),
  });
  const testModels = api.topics.testModelSettings.useMutation();
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
      filter: settings.rule?.filter,
      traceIdleMs: settings.traceIdleMs,
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    capture("topics:setup_opened", { source: "start_analyzing" });
  }, [capture]);
  const changeFilter = (filter: FilterState) =>
    setDraft((current) => ({ ...current, filter }));
  const traceFilter = useTopicTraceFilter({
    projectId,
    active: draft.step === "traces",
    filters: draft.filter,
    onFiltersChange: changeFilter,
  });
  // The rule a save created; going Back and Next again must update it, not add one.
  const [savedRuleId, setSavedRuleId] = useState(settings.rule?.id);
  // Counted once per step 2 visit; the slider only rescales the result.
  const counts = api.topics.setupTraceCounts.useQuery(
    { projectId, filter: draft.filter },
    {
      enabled:
        draft.step !== "questions" && !topicRuleFilterError(draft.filter),
      retry: false,
    },
  );
  const pastCount = pastTraceCount(
    counts.data,
    draft.samplePercent,
    counts.error?.message ?? null,
    counts.isFetching,
  );

  function resolveModels() {
    const summary = resolveTopicModelSlot(draft.summary, connections, "chat");
    const embedding = resolveTopicModelSlot(
      draft.embedding,
      connections,
      "embedding",
      settings.stored.embedding,
    );
    const clustering = resolveTopicModelSlot(
      draft.clustering,
      connections,
      "chat",
    );
    if (!summary || !embedding || !clustering)
      throw new Error("Choose a model from a connection in this project.");
    return {
      summary,
      embedding,
      embeddingDimensions: settings.stored.embeddingDimensions,
      clustering,
    };
  }

  // Step 1 only checks the models; nothing is stored until the Traces step.
  async function checkModels() {
    const errors = await testModels.mutateAsync({
      projectId,
      ...resolveModels(),
    });
    const messages = Object.values(errors).filter(Boolean);
    if (messages.length > 0) throw new Error(messages.join(" "));
    capture("topics:setup_step_saved", {
      step: "questions",
      questionCount: draft.questions.filter((question) => question.enabled)
        .length,
      followsRecommendation: followsTopicRecommendations(draft),
      waitMinutes: draft.waitMinutes,
    });
  }

  /** Stores the models, the rule (facets and filter) and the idle time together. */
  async function saveSetup() {
    const saved = await save.mutateAsync({
      projectId,
      ...resolveModels(),
      facets: draft.questions.map((question) => ({
        name: question.name,
        enabled: question.enabled,
      })),
      customFacetIds: settings.facets.flatMap((facet) =>
        !facet.isBuiltIn && settings.rule?.facetIds.includes(facet.id)
          ? [facet.id]
          : [],
      ),
      filter: draft.filter,
      traceIdleMs: draft.waitMinutes * 60_000,
      ...(savedRuleId ? { ruleId: savedRuleId } : { name: "Default" }),
    });
    if (saved) setSavedRuleId(saved.id);
    return saved?.id ?? savedRuleId;
  }

  // `ruleId` is the rule the setup just saved, before state and the rules query catch up.
  async function persistSampling(enabled: boolean, ruleId = savedRuleId) {
    await onSaveSampling({
      enabled,
      sampling: draft.samplePercent / 100,
      ruleId,
    });
  }

  async function startAnalyzing() {
    if (!savedRuleId) throw new Error("Save the trace filter first.");
    await persistSampling(true);
    await startRuleSetup.mutateAsync({ projectId, ruleId: savedRuleId });
    capture("topics:setup_started", { samplePercent: draft.samplePercent });
    closeDialog();
  }

  async function handleNext() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (draft.step === "questions") {
        await checkModels();
        setDraft((current) => ({ ...current, step: "traces" }));
        return;
      }
      if (draft.step === "traces") {
        await persistSampling(false, await saveSetup());
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
      projectId={projectId}
      filter={draft.filter}
      onFilterChange={changeFilter}
      traceFilter={traceFilter}
      pastCount={pastCount}
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
  counts: { finished7d: number; finished30d: number } | undefined,
  samplePercent: number,
  error: string | null,
  fetching: boolean,
): TopicSetupPastCount {
  if (counts) {
    // Setup reads at most 30 days, so that bounds what it can find.
    return {
      status: "ready",
      matched: Math.min(
        TOPIC_SETUP_BACKFILL_LIMIT,
        Math.round((counts.finished30d * samplePercent) / 100),
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
