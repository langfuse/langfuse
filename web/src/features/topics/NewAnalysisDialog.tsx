import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import type { FilterState } from "@langfuse/shared";
import {
  TOPICS_SLICE_MAX_TRACES,
  type TopicFacet,
} from "@langfuse/shared/topics";
import { Button } from "@/src/components/design-system/Button/Button";
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
import { useTopicFilterColumns } from "./useTopicFilterColumns";
import type { ProcessPastTracesPrefill } from "./ProcessPastTracesDialog";

const windows = [7, 30] as const;
const count = (value: number) => value.toLocaleString("en-US");

/**
 * Starts a one-off clustering run over already summarized traces of a slice.
 * The parent rule is picked on the server: the narrowest rule it narrows down.
 */
export function NewAnalysisDialog({
  projectId,
  facets,
  initialFilter,
  onStarted,
  onProcessPastTraces,
  closeDialog,
}: {
  projectId: string;
  facets: TopicFacet[];
  initialFilter: FilterState;
  onStarted: (analysis: { executionId: string }) => void;
  onProcessPastTraces: (prefill: ProcessPastTracesPrefill) => void;
  closeDialog: () => void;
}) {
  const [now] = useState(Date.now);
  const [filter, setFilter] = useState(initialFilter);
  const [facetIds, setFacetIds] = useState(() => facets.map(({ id }) => id));
  const [days, setDays] = useState<number>(7);
  const [label, setLabel] = useState<string | null>(null);
  const range = dayWindow(days, now);
  const facetRefs = latestFacetRefs(facets, facetIds);
  const { builderColumns } = useTopicFilterColumns({
    projectId,
    filter,
    range,
    scope: "analysis",
    enabled: true,
  });
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
      title="New analysis"
      size="lg"
      actions={[
        {
          label: "Run analysis",
          disabled: !ready || !facetRefs.length || preview.isFetching,
          loading: start.isPending,
          onClick: () => {
            run().catch(() => undefined);
          },
        },
      ]}
    >
      <Dialog.Body>
        <p className="text-muted-foreground">
          Clusters a fixed slice of summarized traces once. Analyses never
          change the live topics of your rules.
        </p>
        <TopicSliceFields.Section
          label="Traces"
          description="Any tracing filter, including scores, latency, cost and negative filters."
        >
          <TopicSliceFields.Filter
            columns={builderColumns}
            filter={filter}
            onChange={setFilter}
          />
        </TopicSliceFields.Section>
        <TopicSliceFields.Section label="Window">
          <TopicSliceFields.Window
            days={windows}
            value={days}
            onChange={setDays}
          />
        </TopicSliceFields.Section>
        <TopicSliceFields.Section label="Facets">
          <TopicSliceFields.Facets
            facets={facets}
            selectedIds={facetIds}
            onChange={setFacetIds}
          />
        </TopicSliceFields.Section>
        <TopicSliceFields.Section label="Name">
          <Input
            aria-label="Analysis name"
            value={name}
            maxLength={100}
            onChange={(event) => setLabel(event.target.value)}
          />
        </TopicSliceFields.Section>
        <TopicSliceFields.Counts
          items={[
            {
              label: "Matching traces",
              value: preview.data ? count(preview.data.matchedTraceCount) : "…",
            },
            {
              label: `Summarized, will be clustered (random sample of at most ${count(TOPICS_SLICE_MAX_TRACES)})`,
              value: preview.data ? count(preview.data.summarizedCount) : "…",
              emphasis: true,
            },
            {
              label: "Compared with",
              value: preview.data
                ? (preview.data.parentRule?.name ?? "No rule")
                : "…",
            },
          ]}
        />
        {preview.data && !preview.data.ready ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <p className="text-sm">
              An analysis needs at least {count(preview.data.minimumTraceCount)}{" "}
              summarized traces. Process past traces for this slice first.
            </p>
            <Button
              variant="outline"
              size="sm"
              text="Process past traces"
              onClick={() => {
                closeDialog();
                onProcessPastTraces({ filter, facetIds });
              }}
            />
          </div>
        ) : null}
        {[preview.error, start.error].map((error) =>
          error ? (
            <TopicsErrorMessage key={error.message} message={error.message} />
          ) : null,
        )}
      </Dialog.Body>
    </Dialog>
  );
}
