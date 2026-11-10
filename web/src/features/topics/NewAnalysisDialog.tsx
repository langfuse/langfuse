import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import type { FilterState } from "@langfuse/shared";
import {
  TOPICS_SLICE_MAX_TRACES,
  type TopicFacet,
} from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { api } from "@/src/utils/api";
import {
  dayWindow,
  latestFacetRefs,
  suggestTopicAnalysisLabel,
} from "./topic-maps";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicsErrorMessage } from "./TopicsErrorMessage";

const windows = [7, 30] as const;
const count = (value: number) => value.toLocaleString("en-US");

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
    <Dialog
      title="New scan"
      size="md"
      actions={[
        {
          label: "Start scan",
          disabled: !ready || !facetRefs.length || preview.isFetching,
          loading: start.isPending,
          onClick: () => {
            run().catch(() => undefined);
          },
        },
      ]}
    >
      <Dialog.Body separators="both">
        <div className="ph-no-capture flex flex-col gap-6">
          <p className="text-muted-foreground text-sm">
            Groups already summarized traces into topics once. Live maps don’t
            change.
          </p>
          <TopicSliceFields.Section
            label="Name"
            description="Suggested from the filters until you edit it."
          >
            <Input
              aria-label="Scan name"
              value={name}
              maxLength={100}
              onChange={(event) => setLabel(event.target.value)}
            />
          </TopicSliceFields.Section>
          <TopicSliceFields.Filter
            projectId={projectId}
            timeRange={range}
            filter={filter}
            onChange={setFilter}
          />
          <TopicSliceFields.Facets
            facets={facets}
            selectedIds={facetIds}
            onChange={setFacetIds}
          />
          <TopicSliceFields.Section label="Window">
            <TopicSliceFields.Window
              days={windows}
              value={days}
              onChange={setDays}
            />
          </TopicSliceFields.Section>
          <TopicSliceFields.Counts
            items={[
              {
                label: "Matching traces",
                value: preview.data
                  ? count(preview.data.matchedTraceCount)
                  : "…",
              },
              {
                label: `Summarized, will be clustered (random sample of at most ${count(TOPICS_SLICE_MAX_TRACES)})`,
                value: preview.data ? count(preview.data.summarizedCount) : "…",
                emphasis: true,
              },
            ]}
          />
          {preview.data && !preview.data.ready ? (
            <p className="text-muted-foreground text-sm">
              A scan needs at least {count(preview.data.minimumTraceCount)}{" "}
              summarized traces in this slice.
            </p>
          ) : null}
          {[preview.error, start.error].map((error) =>
            error ? (
              <TopicsErrorMessage key={error.message} message={error.message} />
            ) : null,
          )}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}
