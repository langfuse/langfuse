import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FilterState } from "@langfuse/shared";
import {
  DEFAULT_TOPIC_RULE_NAME,
  topicRuleFilterError,
  type TopicRule,
} from "@langfuse/shared/topics";
import { useTopicTraceFilter } from "./useTopicTraceFilter";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { env } from "@/src/env.mjs";
import { type JudgeModel } from "@/src/features/evals/v2/judgeModel";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { type TopicsSetupStep } from "./topicsAnalytics";
import { useTopicsCapture } from "./useTopicsCapture";
import { type ConfigureTopicsSettingsInput } from "./useTopicSettings";
import { TopicCostEstimate } from "./TopicCostEstimate";
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
  topicSetupMapName,
  type TopicSetupConnection,
  type TopicSetupDraft,
  type TopicSetupQuestion,
} from "./topic-setup-flow";

const SETUP_STEP_NUMBER = {
  questions: 1,
  traces: 2,
  review: 3,
} as const satisfies Record<TopicsSetupStep, number>;

const SETUP_ERROR_STAGE = {
  questions: "model_check",
  traces: "save",
  review: "start",
} as const satisfies Record<TopicsSetupStep, string>;

type SetupAttempt = {
  setupAttemptId: string;
  openedAt: number;
  step: TopicsSetupStep;
  hadError: boolean;
  completedSteps: Set<TopicsSetupStep>;
};

/** The open attempt's analytics state, which outlives a session remount. */
type SetupTracking = {
  attemptId: () => string | null;
  durationMs: () => number;
  stepChanged: (step: TopicsSetupStep) => void;
  errored: () => void;
  /** True the first time a step completes in this attempt. */
  firstCompletion: (step: TopicsSetupStep) => boolean;
  finished: () => void;
};

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
  const capture = useTopicsCapture();
  // Opens only from Start analyzing, never on its own, so the landing shows first.
  const [open, setOpen] = useState(false);
  // Read and written only in handlers; the dialog never renders from it.
  const attempt = useRef<SetupAttempt | null>(null);
  function openSetup() {
    if (settings) {
      attempt.current = {
        setupAttemptId: crypto.randomUUID(),
        openedAt: Date.now(),
        step: "questions",
        hadError: false,
        completedSteps: new Set(),
      };
      capture("topics:setup_flow_opened", {
        setupAttemptId: attempt.current.setupAttemptId,
        hasConnection: settings.connections.length > 0,
        isFirstSetup: !settings.rule,
      });
    }
    setOpen(true);
  }
  function dismissSetup() {
    const current = attempt.current;
    if (current)
      capture("topics:setup_flow_aborted", {
        setupAttemptId: current.setupAttemptId,
        lastStep: current.step,
        stepNumber: SETUP_STEP_NUMBER[current.step],
        durationMs: Date.now() - current.openedAt,
        hadError: current.hadError,
      });
    attempt.current = null;
    setOpen(false);
  }
  const tracking: SetupTracking = {
    attemptId: () => attempt.current?.setupAttemptId ?? null,
    durationMs: () =>
      attempt.current ? Date.now() - attempt.current.openedAt : 0,
    stepChanged: (step) => {
      if (attempt.current) attempt.current.step = step;
    },
    errored: () => {
      if (attempt.current) attempt.current.hadError = true;
    },
    firstCompletion: (step) => {
      if (!attempt.current || attempt.current.completedSteps.has(step))
        return false;
      attempt.current.completedSteps.add(step);
      return true;
    },
    finished: () => {
      attempt.current = null;
    },
  };
  return (
    <>
      {children({ openSetup })}
      {open && settings ? (
        <DialogController<null>
          initialState={() => null}
          onDismiss={dismissSetup}
          renderDialog={({ closeDialog }) => (
            <TopicSetupSession
              // Rebuilds the draft with recommended models once the first connection arrives.
              key={settings.connections.length > 0 ? "ready" : "none"}
              projectId={projectId}
              canWrite={canWrite}
              settings={settings}
              onSaveSampling={onSaveSampling}
              closeDialog={closeDialog}
              tracking={tracking}
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
  tracking,
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
  tracking: SetupTracking;
}) {
  const capture = useTopicsCapture();
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
      // The page follows the first rule's setup from the maps overview.
      utils.topics.maps.invalidate({ projectId });
      utils.topics.tracingReadinessSettings.invalidate({ projectId });
    },
  });
  const saveRule = api.topics.saveRule.useMutation({
    onSuccess: () => utils.topics.maps.invalidate({ projectId }),
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
      name: settings.rule?.name,
      traceIdleMs: settings.traceIdleMs,
    }),
  );
  const mapName = topicSetupMapName(draft);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  function goToStep(step: TopicsSetupStep) {
    tracking.stepChanged(step);
    setDraft((current) => ({ ...current, step }));
  }
  const filterUsage = {
    filterCount: draft.filter.length,
    hasFilter: draft.filter.length > 0,
  };
  const questionCount = draft.questions.filter(
    (question) => question.enabled,
  ).length;
  const changeFilter = (filter: FilterState) =>
    setDraft((current) => ({ ...current, filter }));
  const traceFilter = useTopicTraceFilter({
    projectId,
    active: draft.step === "traces",
    filters: draft.filter,
    onFiltersChange: changeFilter,
  });
  // The rule a save created; going Back and Next again must update it, not add one.
  const [savedRule, setSavedRule] = useState(settings.rule ?? undefined);
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
  }

  function captureStepCompleted(step: "questions" | "traces") {
    const setupAttemptId = tracking.attemptId();
    if (!setupAttemptId || !tracking.firstCompletion(step)) return;
    if (step === "questions")
      capture("topics:setup_flow_step_completed", {
        setupAttemptId,
        step,
        stepNumber: 1,
        questionCount,
        followsRecommendation: followsTopicRecommendations(draft),
        waitMinutes: draft.waitMinutes,
      });
    else
      capture("topics:setup_flow_step_completed", {
        setupAttemptId,
        step,
        stepNumber: 2,
        samplePercent: draft.samplePercent,
        ...filterUsage,
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
      ...(savedRule
        ? { ruleId: savedRule.id }
        : { name: mapName.trim() || DEFAULT_TOPIC_RULE_NAME }),
    });
    if (saved) setSavedRule(saved);
    return (saved ?? savedRule)?.id;
  }

  // `ruleId` is the rule the setup just saved, before state and the rules query catch up.
  async function persistSampling(enabled: boolean, ruleId = savedRule?.id) {
    await onSaveSampling({
      enabled,
      sampling: draft.samplePercent / 100,
      ruleId,
    });
  }

  // The rule is saved before the review step, where its name is edited.
  async function renameSavedRule(rule: TopicRule) {
    const name = mapName.trim();
    if (name === rule.name) return;
    setSavedRule(
      await saveRule.mutateAsync({
        projectId,
        id: rule.id,
        name,
        filter: rule.filter,
        facetIds: rule.facetIds,
      }),
    );
  }

  async function startAnalyzing() {
    if (!savedRule) throw new Error("Save the trace filter first.");
    await renameSavedRule(savedRule);
    await persistSampling(true);
    await startRuleSetup.mutateAsync({ projectId, ruleId: savedRule.id });
    const setupAttemptId = tracking.attemptId();
    if (setupAttemptId)
      capture("topics:setup_flow_finished", {
        setupAttemptId,
        samplePercent: draft.samplePercent,
        questionCount,
        hasCostEstimate:
          utils.topics.costEstimate.getData({
            projectId,
            filter: draft.filter,
            facetIds: savedRule.facetIds,
          })?.status === "done",
        durationMs: tracking.durationMs(),
        ...filterUsage,
      });
    tracking.finished();
    closeDialog();
  }

  async function handleNext() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (draft.step === "questions") {
        await checkModels();
        captureStepCompleted("questions");
        goToStep("traces");
        return;
      }
      if (draft.step === "traces") {
        await persistSampling(false, await saveSetup());
        captureStepCompleted("traces");
        goToStep("review");
        return;
      }
      await startAnalyzing();
    } catch (cause) {
      tracking.errored();
      const setupAttemptId = tracking.attemptId();
      if (setupAttemptId)
        capture("topics:setup_flow_error", {
          setupAttemptId,
          step: draft.step,
          stage: SETUP_ERROR_STAGE[draft.step],
        });
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
      costEstimate={
        <TopicCostEstimate
          projectId={projectId}
          filter={draft.filter}
          facetIds={savedRule?.facetIds ?? []}
          samplingPercent={draft.samplePercent}
          dailyTraces={
            pastCount.status === "ready" ? pastCount.dailyTraces : null
          }
          backfillTraces={
            pastCount.status === "ready" ? pastCount.matched : null
          }
          source="setup"
        />
      }
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
        const setupAttemptId = tracking.attemptId();
        if (setupAttemptId)
          capture("topics:setup_flow_connection_redirect", {
            setupAttemptId,
            canAddConnection,
          });
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
      name={mapName}
      onNameChange={(name) => setDraft((current) => ({ ...current, name }))}
      onEdit={goToStep}
      onBack={() => goToStep(draft.step === "review" ? "traces" : "questions")}
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
