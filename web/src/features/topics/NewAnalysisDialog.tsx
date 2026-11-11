import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import type { FilterState } from "@langfuse/shared";
import type { TopicFacet } from "@langfuse/shared/topics";
import { api } from "@/src/utils/api";
import {
  dayWindow,
  latestFacetRefs,
  suggestTopicAnalysisLabel,
} from "./topic-maps";
import { TopicSliceFields } from "./TopicSliceFields";
import { NewAnalysisDialogView } from "./NewAnalysisDialogView";

/**
 * Starts a one-off clustering run over already summarized traces of a slice.
 */
export function NewAnalysisDialog({
  projectId,
  facets,
  initialFilter,
  onStarted,
  closeDialog,
}: {
  projectId: string;
  facets: TopicFacet[];
  initialFilter: FilterState;
  onStarted: (analysis: { executionId: string }) => void;
  closeDialog: () => void;
}) {
  const [now] = useState(Date.now);
  const [filter, setFilter] = useState(initialFilter);
  const [facetIds, setFacetIds] = useState(() => facets.map(({ id }) => id));
  const [days, setDays] = useState<number>(7);
  const [label, setLabel] = useState<string | null>(null);
  const range = dayWindow(days, now);
  const facetRefs = latestFacetRefs(facets, facetIds);
  const preview = api.topics.previewAnalysis.useQuery(
    { projectId, filter, timeRange: range, facets: facetRefs },
    { enabled: facetRefs.length > 0, placeholderData: keepPreviousData },
  );
  const utils = api.useUtils();
  const start = api.topics.startAnalysis.useMutation({
    onSuccess: () => utils.topics.maps.invalidate({ projectId }),
  });
  const name = label ?? suggestTopicAnalysisLabel(filter);
  const ready = Boolean(preview.data?.ready);

  async function run() {
    const result = await start.mutateAsync({
      projectId,
      label: name.trim() || suggestTopicAnalysisLabel(filter),
      filter,
      timeRange: range,
      facets: facetRefs,
    });
    closeDialog();
    onStarted({ executionId: result.id });
  }

  return (
    <NewAnalysisDialogView
      name={name}
      onNameChange={setLabel}
      filterField={
        <TopicSliceFields.Filter
          projectId={projectId}
          timeRange={range}
          filter={filter}
          onChange={setFilter}
        />
      }
      facets={facets}
      facetIds={facetIds}
      onFacetIdsChange={setFacetIds}
      days={days}
      onDaysChange={setDays}
      preview={preview.data ?? null}
      canStart={ready && facetRefs.length > 0 && !preview.isFetching}
      starting={start.isPending}
      errors={[preview.error, start.error].flatMap((error) =>
        error ? [error.message] : [],
      )}
      onStart={() => {
        run().catch(() => undefined);
      }}
    />
  );
}
