import { useState } from "react";
import { useForm } from "react-hook-form";
import { keepPreviousData } from "@tanstack/react-query";
import type { FilterState } from "@langfuse/shared";
import { topicRuleFilterError, type TopicFacet } from "@langfuse/shared/topics";
import { api } from "@/src/utils/api";
import {
  dayWindow,
  latestFacetRefs,
  suggestTopicAnalysisLabel,
  suggestTopicRuleName,
} from "./topic-maps";
import { TOPIC_SETUP_BACKFILL_DAYS } from "./topic-setup-flow";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicTraceFilterSection } from "./TopicTraceFilterSection";
import { useTopicTraceFilter } from "./useTopicTraceFilter";
import { NewAnalysisDialogView } from "./NewAnalysisDialogView";

type NewScanForm = {
  /** Null until edited, so the name follows the filter. */
  name: string | null;
  filter: FilterState;
  facetIds: string[];
  live: boolean;
  samplingPercent: number;
};

/**
 * Starts a scan: a one-off clustering run over already summarized traces, or
 * with auto-analyze on, a live rule that analyzes new matching traces.
 */
export function NewAnalysisDialog({
  projectId,
  facets,
  liveDisabledReason,
  onStarted,
  onRuleCreated,
  closeDialog,
}: {
  projectId: string;
  facets: TopicFacet[];
  liveDisabledReason?: string;
  onStarted: (analysis: { executionId: string }) => void;
  onRuleCreated: (ruleId: string) => void;
  closeDialog: () => void;
}) {
  const [now] = useState(Date.now);
  const form = useForm<NewScanForm>({
    defaultValues: {
      name: null,
      filter: [],
      facetIds: facets.map(({ id }) => id),
      // Live unless the project is at its live scan limit.
      live: !liveDisabledReason,
      samplingPercent: 100,
    },
  });
  const {
    name: editedName,
    filter,
    facetIds,
    live: liveChecked,
    samplingPercent,
  } = form.watch();
  // The live limit can load after the form starts live; then it's a one-off scan.
  const live = liveChecked && !liveDisabledReason;
  const setFilter = (next: FilterState) => form.setValue("filter", next);
  // Setup's window: its preview, its backfill, and the summaries a scan groups.
  const range = dayWindow(TOPIC_SETUP_BACKFILL_DAYS, now);
  const facetRefs = latestFacetRefs(facets, facetIds);
  const utils = api.useUtils();

  // Live and one-off scans share the setup filter and its trace preview.
  const traceFilter = useTopicTraceFilter({
    projectId,
    active: true,
    filters: filter,
    onFiltersChange: setFilter,
  });
  const filterError = topicRuleFilterError(filter);
  const preview = api.topics.previewAnalysis.useQuery(
    { projectId, filter, timeRange: range, facets: facetRefs },
    {
      enabled: !live && !filterError && facetRefs.length > 0,
      placeholderData: keepPreviousData,
    },
  );
  const start = api.topics.startAnalysis.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.topics.maps.invalidate({ projectId }),
        utils.topics.executions.invalidate({ projectId }),
      ]),
  });

  const traceCounts = api.topics.setupTraceCounts.useQuery(
    { projectId, filter },
    { enabled: live && !filterError, retry: false },
  );
  const createRule = api.topics.saveRule.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.topics.maps.invalidate({ projectId }),
        utils.topics.rules.invalidate({ projectId }),
      ]),
  });

  const suggestedName = live
    ? suggestTopicRuleName(filter)
    : suggestTopicAnalysisLabel(filter);
  const name = editedName ?? suggestedName;

  const startRuleSetup = api.topics.startRuleSetup.useMutation({
    onSuccess: () => utils.topics.ruleSetupStatus.invalidate({ projectId }),
  });

  async function submit(values: NewScanForm) {
    const label = values.name?.trim() || suggestedName;
    if (live) {
      const rule = await createRule.mutateAsync({
        projectId,
        name: label,
        filter: values.filter,
        facetIds: values.facetIds,
        sampling: values.samplingPercent / 100,
      });
      // The rule exists either way: the error toast reports a failed start,
      // and the page then shows the rule's building state.
      await startRuleSetup
        .mutateAsync({ projectId, ruleId: rule.id })
        .catch(() => null);
      closeDialog();
      onRuleCreated(rule.id);
      return;
    }
    const result = await start.mutateAsync({
      projectId,
      label,
      filter: values.filter,
      timeRange: range,
      facets: facetRefs,
    });
    closeDialog();
    onStarted({ executionId: result.id });
  }

  const canStart =
    traceFilter.ready &&
    !filterError &&
    facetRefs.length > 0 &&
    (live || (Boolean(preview.data?.ready) && !preview.isFetching));

  return (
    <NewAnalysisDialogView
      name={name}
      onNameChange={(next) => form.setValue("name", next)}
      filterField={
        <TopicTraceFilterSection
          projectId={projectId}
          filters={filter}
          onFiltersChange={setFilter}
          model={traceFilter}
        />
      }
      facets={facets}
      facetIds={facetIds}
      onFacetIdsChange={(next) => form.setValue("facetIds", next)}
      live={live}
      onLiveChange={(next) => form.setValue("live", next)}
      liveDisabledReason={liveDisabledReason}
      samplingField={
        <TopicSliceFields.Sampling
          value={samplingPercent}
          onChange={(next) => form.setValue("samplingPercent", next)}
          dailyTraces={
            traceCounts.data
              ? traceCounts.data.finished7d / TOPIC_SETUP_BACKFILL_DAYS
              : null
          }
          tooltip="Share of new matching traces this scan analyzes."
        />
      }
      preview={preview.data ?? null}
      canStart={canStart}
      starting={
        start.isPending || createRule.isPending || startRuleSetup.isPending
      }
      errors={[
        filterError && filter.length ? filterError : null,
        ...[live ? null : preview.error, start.error, createRule.error].map(
          (error) => error?.message ?? null,
        ),
      ].flatMap((message) => (message ? [message] : []))}
      onStart={() => {
        form
          .handleSubmit(submit)()
          .catch(() => undefined);
      }}
    />
  );
}
