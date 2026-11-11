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

const windows = [7, 30] as const;

type NewScanForm = {
  /** Null until edited, so the name follows the filter. */
  name: string | null;
  filter: FilterState;
  facetIds: string[];
  days: number;
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
  initialFilter,
  liveDisabledReason,
  onStarted,
  onRuleCreated,
  closeDialog,
}: {
  projectId: string;
  facets: TopicFacet[];
  initialFilter: FilterState;
  liveDisabledReason?: string;
  onStarted: (analysis: { executionId: string }) => void;
  onRuleCreated: (ruleId: string) => void;
  closeDialog: () => void;
}) {
  const [now] = useState(Date.now);
  const form = useForm<NewScanForm>({
    defaultValues: {
      name: null,
      filter: initialFilter,
      facetIds: facets.map(({ id }) => id),
      days: 7,
      live: false,
      samplingPercent: 100,
    },
  });
  const {
    name: editedName,
    filter,
    facetIds,
    days,
    live,
    samplingPercent,
  } = form.watch();
  const setFilter = (next: FilterState) => form.setValue("filter", next);
  const range = dayWindow(days, now);
  const facetRefs = latestFacetRefs(facets, facetIds);
  const utils = api.useUtils();

  const preview = api.topics.previewAnalysis.useQuery(
    { projectId, filter, timeRange: range, facets: facetRefs },
    {
      enabled: !live && facetRefs.length > 0,
      placeholderData: keepPreviousData,
    },
  );
  const start = api.topics.startAnalysis.useMutation({
    onSuccess: () => utils.topics.maps.invalidate({ projectId }),
  });

  // A live scan uses the rule filter setup and Edit scan use.
  const traceFilter = useTopicTraceFilter({
    projectId,
    active: live,
    filters: filter,
    onFiltersChange: setFilter,
  });
  const filterError = live ? topicRuleFilterError(filter) : null;
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

  async function submit(values: NewScanForm) {
    const label = values.name?.trim() || suggestedName;
    if (values.live) {
      const rule = await createRule.mutateAsync({
        projectId,
        name: label,
        filter: values.filter,
        facetIds: values.facetIds,
        sampling: values.samplingPercent / 100,
      });
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

  const canStart = live
    ? traceFilter.ready && !filterError && facetIds.length > 0
    : Boolean(preview.data?.ready) &&
      facetRefs.length > 0 &&
      !preview.isFetching;

  return (
    <NewAnalysisDialogView
      name={name}
      onNameChange={(next) => form.setValue("name", next)}
      filterField={
        live ? (
          <TopicTraceFilterSection
            projectId={projectId}
            filters={filter}
            onFiltersChange={setFilter}
            model={traceFilter}
          />
        ) : (
          <TopicSliceFields.Filter
            projectId={projectId}
            timeRange={range}
            filter={filter}
            onChange={setFilter}
            windowControl={
              <TopicSliceFields.Window
                days={windows}
                value={days}
                onChange={(next) => form.setValue("days", next)}
              />
            }
          />
        )
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
      starting={start.isPending || createRule.isPending}
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
