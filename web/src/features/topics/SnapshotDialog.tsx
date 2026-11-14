import { useState } from "react";
import { useForm } from "react-hook-form";
import { keepPreviousData } from "@tanstack/react-query";
import type { FilterState } from "@langfuse/shared";
import { topicRuleFilterError, type TopicFacet } from "@langfuse/shared/topics";
import { useDebounce } from "@/src/hooks/useDebounce";
import { api } from "@/src/utils/api";
import { dayWindow, latestFacetRefs } from "./topic-maps";
import { TopicTraceFilterSection } from "./TopicTraceFilterSection";
import { useTopicTraceFilter } from "./useTopicTraceFilter";
import {
  SNAPSHOT_DEFAULT_SUMMARIZE,
  SnapshotDialogView,
  snapshotSummarizeCount,
  type SnapshotSummarize,
} from "./SnapshotDialogView";

type SnapshotForm = {
  name: string;
  filter: FilterState;
  facetIds: string[];
  windowDays: number;
  summarize: SnapshotSummarize;
};

/** Creates a snapshot: a fixed topic map over a past window, optionally summarizing more traces first. */
export function SnapshotDialog({
  projectId,
  facets,
  onStarted,
  closeDialog,
}: {
  projectId: string;
  facets: TopicFacet[];
  onStarted: (executionId: string) => void;
  closeDialog: () => void;
}) {
  const [now] = useState(Date.now);
  const form = useForm<SnapshotForm>({
    defaultValues: {
      name: "",
      filter: [],
      facetIds: facets.map(({ id }) => id),
      windowDays: 7,
      summarize: SNAPSHOT_DEFAULT_SUMMARIZE,
    },
  });
  const { name, filter, facetIds, windowDays, summarize } = form.watch();
  // A burst of edits fires one preview, which scans events on the replica.
  const previewFields = () => {
    const { filter, facetIds, windowDays } = form.getValues();
    return { filter, facetIds, windowDays };
  };
  const [previewInput, setPreviewInput] = useState(previewFields);
  const schedulePreview = useDebounce(setPreviewInput, 500, false);
  const previewStale =
    JSON.stringify(previewInput) !==
    JSON.stringify({ filter, facetIds, windowDays });
  const setFilter = (next: FilterState) => {
    form.setValue("filter", next);
    schedulePreview(previewFields());
  };
  const range = dayWindow(windowDays, now);
  const facetRefs = latestFacetRefs(facets, facetIds);
  const utils = api.useUtils();

  const traceFilter = useTopicTraceFilter({
    projectId,
    active: true,
    filters: filter,
    onFiltersChange: setFilter,
    days: windowDays,
  });
  const filterError = topicRuleFilterError(filter);
  const previewFacets = latestFacetRefs(facets, previewInput.facetIds);
  const counts = api.topics.previewAnalysis.useQuery(
    {
      projectId,
      filter: previewInput.filter,
      timeRange: dayWindow(previewInput.windowDays, now),
      facets: previewFacets,
    },
    {
      enabled:
        !topicRuleFilterError(previewInput.filter) && previewFacets.length > 0,
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

  const preview = counts.data ?? null;
  const extra = snapshotSummarizeCount(summarize, preview);

  async function submit(values: SnapshotForm) {
    const result = await start.mutateAsync({
      projectId,
      label: values.name.trim(),
      filter: values.filter,
      timeRange: range,
      facets: facetRefs,
      ...(extra > 0
        ? {
            summarize: {
              limit: extra,
              selection: values.summarize.selection,
            },
          }
        : {}),
    });
    closeDialog();
    onStarted(result.id);
  }

  const canStart =
    name.trim().length > 0 &&
    traceFilter.ready &&
    !filterError &&
    facetRefs.length > 0 &&
    preview !== null &&
    !counts.isFetching &&
    !previewStale &&
    preview.summarizedCount + extra >= preview.smallSampleMinimumTraceCount;

  return (
    <SnapshotDialogView
      name={name}
      onNameChange={(next) => form.setValue("name", next)}
      filterField={
        <TopicTraceFilterSection
          projectId={projectId}
          filters={filter}
          onFiltersChange={setFilter}
          kind="snapshot"
          model={traceFilter}
          days={windowDays}
          onDaysChange={(next) => {
            form.setValue("windowDays", next);
            schedulePreview(previewFields());
          }}
        />
      }
      facets={facets}
      facetIds={facetIds}
      onFacetIdsChange={(next) => {
        form.setValue("facetIds", next);
        schedulePreview(previewFields());
      }}
      preview={preview}
      summarize={summarize}
      onSummarizeChange={(next) => form.setValue("summarize", next)}
      canStart={canStart}
      starting={start.isPending}
      errors={[
        filterError && filter.length ? filterError : null,
        counts.error?.message ?? null,
        start.error?.message ?? null,
      ].flatMap((message) => (message ? [message] : []))}
      onStart={() => {
        form
          .handleSubmit(submit)()
          .catch(() => undefined);
      }}
    />
  );
}
