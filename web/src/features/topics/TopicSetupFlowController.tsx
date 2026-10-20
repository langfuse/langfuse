import { useEffect, useState, type ReactNode } from "react";
import {
  eventsEvalFilterColumns,
  experimentEvalFilterColsWithOptions,
  observationEvalFilterColsWithOptions,
  type FilterState,
  type TimeFilter,
} from "@langfuse/shared";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { env } from "@/src/env.mjs";
import { FilterModeToggle } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/FilterModeToggle";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import { type JudgeModel } from "@/src/features/evals/v2/judgeModel";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { TableSearchBar, toObservedOptions } from "@/src/features/search-bar";
import { api } from "@/src/utils/api";
import { type ConfigureTopicsSettingsInput } from "./TopicModelSettings";
import {
  TopicSetupFlowDialog,
  type TopicSetupPastCount,
} from "./TopicSetupFlowDialog";
import { TOPICS_BACKFILL_TRACE_LIMIT } from "./backfill-limit";
import {
  followsTopicRecommendations,
  initialTopicSetupDraft,
  pastBatchLimit,
  resolveTopicModelSlot,
  topicConnectionCaption,
  topicProviderGroups,
  type TopicSetupConnection,
  type TopicSetupDraft,
  type TopicSetupQuestion,
} from "./topic-setup-flow";
import { relativeTopicTimeRange } from "./time-range";

export function TopicSetupFlowController({
  canWrite,
  children,
  configured,
  onSaveSampling,
  projectId,
  settings,
}: {
  projectId: string;
  canWrite: boolean;
  configured: boolean;
  settings: ConfigureTopicsSettingsInput | null;
  onSaveSampling: (input: {
    enabled: boolean;
    sampling: number;
  }) => Promise<unknown>;
  children: (control: { openSetup: () => void }) => ReactNode;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [source, setSource] = useState<"automatic" | "reopened">("automatic");
  const open = Boolean(settings) && !dismissed && (!configured || heldOpen);
  function openSetup() {
    setSource("reopened");
    setDismissed(false);
    setHeldOpen(true);
  }
  function closeSetup() {
    setDismissed(true);
    setHeldOpen(false);
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
              projectId={projectId}
              canWrite={canWrite}
              settings={settings}
              source={source}
              onSaveSampling={onSaveSampling}
              onHoldOpen={() => setHeldOpen(true)}
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
  onHoldOpen,
  onSaveSampling,
  projectId,
  settings,
  source,
}: {
  projectId: string;
  canWrite: boolean;
  settings: ConfigureTopicsSettingsInput;
  source: "automatic" | "reopened";
  onSaveSampling: (input: {
    enabled: boolean;
    sampling: number;
  }) => Promise<unknown>;
  onHoldOpen: () => void;
  closeDialog: () => void;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const save = api.topics.saveSetup.useMutation({
    onSuccess: () => {
      utils.topics.modelSettings.invalidate({ projectId });
      utils.topics.facets.invalidate({ projectId });
      utils.topics.rules.invalidate({ projectId });
      utils.topics.tracingReadinessSettings.invalidate({ projectId });
    },
  });
  const trigger = api.topics.trigger.useMutation();
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
  useEffect(() => {
    capture("topics:setup_opened", { source });
  }, [capture, source]);
  const [countedAt] = useState(() => new Date());
  const range = relativeTopicTimeRange(draft.pastDays, countedAt);
  const preview = api.topics.previewTraces.useQuery(
    {
      projectId,
      filter: draft.filter,
      from: range.from,
      to: range.to,
      limit: TOPICS_BACKFILL_TRACE_LIMIT,
      sampling: "random",
      seed: "setup-count",
    },
    {
      enabled: draft.pastOn && draft.step !== "questions",
      retry: false,
    },
  );
  const pastCount = pastTraceCount(
    draft.pastOn,
    preview.data?.matchedTraceCount,
    preview.error?.message ?? null,
    preview.isFetching,
  );

  async function saveQuestions() {
    onHoldOpen();
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
    onHoldOpen();
    await persistSampling(true);
    if (!draft.pastOn) {
      capture("topics:setup_started", {
        hasPastTraces: false,
        samplePercent: draft.samplePercent,
      });
      closeDialog();
      return;
    }
    const matched = preview.data?.matchedTraceCount ?? 0;
    const limit = pastBatchLimit(matched, draft.samplePercent);
    if (limit === 0) throw new Error("No past traces match this selection.");
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
    await trigger.mutateAsync({
      projectId,
      operation: "process",
      facets: refs,
      reuseExistingSummaries: true,
      requestId: crypto.randomUUID(),
      selection: {
        filter: draft.filter,
        from: range.from,
        to: range.to,
        limit,
        sampling: "random",
        seed: crypto.randomUUID(),
        excludedTraceIds: [],
      },
    });
    await utils.topics.executions.invalidate({ projectId });
    capture("topics:setup_started", {
      hasPastTraces: true,
      samplePercent: draft.samplePercent,
      pastDays: draft.pastDays,
    });
    closeDialog();
  }

  async function handleNext() {
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
          hasPastTraces: draft.pastOn,
          pastDays: draft.pastDays,
        });
        setDraft((current) => ({ ...current, step: "review" }));
        return;
      }
      await startAnalyzing();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save Topics.",
      );
    }
  }

  return (
    <TopicSetupFlowDialog
      step={draft.step}
      busy={save.isPending || trigger.isPending}
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
      advancedOpen={draft.advancedOpen}
      waitMinutes={draft.waitMinutes}
      samplePercent={draft.samplePercent}
      pastOn={draft.pastOn}
      pastDays={draft.pastDays}
      pastCount={pastCount}
      renderFilter={() => (
        <TopicSetupPastFilter
          projectId={projectId}
          filter={draft.filter}
          filterMode={draft.filterMode}
          range={range}
          onFilterChange={(filter) =>
            setDraft((current) => ({ ...current, filter }))
          }
          onFilterModeChange={(filterMode) =>
            setDraft((current) => ({ ...current, filterMode }))
          }
        />
      )}
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
        window.open(
          `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/project/${projectId}/settings/llm-connections`,
          "_blank",
          "noopener,noreferrer",
        );
      }}
      onAdvancedOpenChange={(advancedOpen) =>
        setDraft((current) => ({ ...current, advancedOpen }))
      }
      onWaitMinutesChange={(waitMinutes) =>
        setDraft((current) => ({ ...current, waitMinutes }))
      }
      onSamplePercentChange={(samplePercent) =>
        setDraft((current) => ({ ...current, samplePercent }))
      }
      onPastOnChange={(pastOn) =>
        setDraft((current) => ({ ...current, pastOn }))
      }
      onPastDaysChange={(pastDays) =>
        setDraft((current) => ({ ...current, pastDays }))
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
  pastOn: boolean,
  matched: number | undefined,
  error: string | null,
  fetching: boolean,
): TopicSetupPastCount {
  if (!pastOn) return { status: "hidden", matched: null };
  if (matched !== undefined) return { status: "ready", matched };
  if (error && !fetching)
    return { status: "error", matched: null, message: error };
  return { status: "loading", matched: null };
}

function TopicSetupPastFilter({
  filter,
  filterMode,
  onFilterChange,
  onFilterModeChange,
  projectId,
  range,
}: {
  projectId: string;
  filter: FilterState;
  filterMode: "query" | "builder";
  range: { from: Date; to: Date };
  onFilterChange: (filter: FilterState) => void;
  onFilterModeChange: (mode: "query" | "builder") => void;
}) {
  const startTimeFilter: TimeFilter[] = [
    {
      column: "startTime",
      type: "datetime",
      operator: ">=",
      value: range.from,
    },
    { column: "startTime", type: "datetime", operator: "<", value: range.to },
  ];
  const options = useEventsFilterOptions({
    projectId,
    startTimeFilter,
    refiningFilter: filter.map((item) =>
      item.column === "tags" ? { ...item, column: "traceTags" } : item,
    ),
    lazy: filterMode === "query",
    columns: [
      "environment",
      "name",
      "traceTags",
      "traceName",
      "calledToolNames",
      "experimentDatasetId",
      "experimentId",
    ],
    enabled: true,
  });
  const observed = toObservedOptions(
    options.filterOptions,
    options.isFilterOptionsPending,
  );
  const builderColumns = experimentEvalFilterColsWithOptions(
    options.filterOptions,
    observationEvalFilterColsWithOptions(
      { ...options.filterOptions, tags: options.filterOptions?.traceTags },
      [...eventsEvalFilterColumns],
    ),
  ).map((column) =>
    column.id === "experimentId" && column.type === "stringOptions"
      ? { ...column, options: options.filterOptions?.experimentId ?? [] }
      : column,
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <FilterModeToggle mode={filterMode} onChange={onFilterModeChange} />
      </div>
      {filterMode === "builder" ? (
        <ObservationFilterBuilder
          columns={builderColumns}
          filterState={filter}
          queryOnlyColumnIds={RULE_FIELD_REGISTRY.fields
            .filter((field) => field.directFilter === false)
            .map((field) => field.filterColumn ?? field.id)}
          onChange={onFilterChange}
        />
      ) : (
        <TableSearchBar
          projectId={projectId}
          tableName="topics-setup-traces"
          registry={RULE_FIELD_REGISTRY}
          filterState={filter}
          setFilterState={onFilterChange}
          observed={
            observed
              ? { ...observed, tags: observed.traceTags ?? [] }
              : undefined
          }
          isV4
        />
      )}
    </div>
  );
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
