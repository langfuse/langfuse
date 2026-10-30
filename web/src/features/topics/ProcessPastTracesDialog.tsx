import { useRef, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import type { FilterState } from "@langfuse/shared";
import {
  TOPICS_SLICE_MAX_TRACES,
  type TopicFacet,
} from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { api } from "@/src/utils/api";
import { dayWindow, latestFacetRefs } from "./topic-maps";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicsErrorMessage } from "./TopicsErrorMessage";
import { useTopicFilterColumns } from "./useTopicFilterColumns";

const windows = [7, 30] as const;
const count = (value: number) => value.toLocaleString("en-US");

export type ProcessPastTracesPrefill = {
  filter: FilterState;
  facetIds: string[];
  /** Shown under the title, e.g. the rule the filters came from. */
  source?: string;
};

/**
 * Summarizes a random sample of past traces so rules and analyses have data.
 * Summaries are shared by every map, so already summarized traces are skipped.
 */
export function ProcessPastTracesDialog({
  projectId,
  facets,
  prefill,
  onStarted,
  closeDialog,
}: {
  projectId: string;
  facets: TopicFacet[];
  prefill: ProcessPastTracesPrefill;
  onStarted: (executionId: string) => void;
  closeDialog: () => void;
}) {
  const [now] = useState(Date.now);
  const [filter, setFilter] = useState(prefill.filter);
  const [facetIds, setFacetIds] = useState(
    prefill.facetIds.length ? prefill.facetIds : facets.map(({ id }) => id),
  );
  const [days, setDays] = useState<number>(7);
  const [seed] = useState(() => crypto.randomUUID());
  const request = useRef<{ key: string; id: string } | null>(null);
  const range = dayWindow(days, now);
  const facetRefs = latestFacetRefs(facets, facetIds);
  const { builderColumns } = useTopicFilterColumns({
    projectId,
    filter,
    range,
    scope: "process",
    enabled: true,
  });
  const selection = {
    filter,
    from: range.from,
    to: range.to,
    limit: TOPICS_SLICE_MAX_TRACES,
    sampling: "random" as const,
    seed,
  };
  const matched = api.topics.previewTraces.useQuery(
    { projectId, ...selection },
    { placeholderData: keepPreviousData },
  );
  const summarized = api.topics.previewAnalysis.useQuery(
    { projectId, filter, timeRange: range, facets: facetRefs },
    { enabled: facetRefs.length > 0, placeholderData: keepPreviousData },
  );
  const trigger = api.topics.trigger.useMutation();
  const selected = matched.data?.selectedTraceCount ?? 0;
  const alreadyProcessed = Math.min(
    selected,
    summarized.data?.summarizedCount ?? 0,
  );
  const toProcess = selected - alreadyProcessed;

  async function start() {
    const values = {
      projectId,
      operation: "process" as const,
      facets: facetRefs,
      reuseExistingSummaries: true,
      selection: { ...selection, excludedTraceIds: [] },
    };
    const key = JSON.stringify(values);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    const result = await trigger.mutateAsync({
      ...values,
      requestId: request.current.id,
    });
    closeDialog();
    onStarted(result.id);
  }

  const blockedReason = processBlockedReason({
    hasFacets: facetRefs.length > 0,
    counting: matched.isPending || summarized.isPending,
    toProcess,
  });
  return (
    <Dialog
      title="Process past traces"
      size="lg"
      actions={[
        {
          label: toProcess
            ? `Process ${count(toProcess)} traces`
            : "Process traces",
          disabled: blockedReason !== null,
          loading: trigger.isPending,
          onClick: () => {
            start().catch(() => undefined);
          },
        },
      ]}
    >
      <Dialog.Body>
        <p className="text-muted-foreground">
          Summarizes past traces so topic rules and analyses can use them.
          {prefill.source ? ` Prefilled from ${prefill.source}.` : null}
        </p>
        <TopicSliceFields.Section
          label="Traces"
          description="Any tracing filter. A trace matches when one of its spans meets every filter."
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
        <TopicSliceFields.Section
          label="Facets"
          description="Each selected facet summarizes every trace once."
        >
          <TopicSliceFields.Facets
            facets={facets}
            selectedIds={facetIds}
            onChange={setFacetIds}
          />
        </TopicSliceFields.Section>
        <TopicSliceFields.Counts
          items={[
            {
              label: "Matching traces",
              value: matched.data ? count(matched.data.matchedTraceCount) : "…",
            },
            {
              label: `Random sample (at most ${count(TOPICS_SLICE_MAX_TRACES)})`,
              value: matched.data ? count(selected) : "…",
            },
            {
              label: "Already processed",
              value: summarized.data ? count(alreadyProcessed) : "…",
            },
            {
              label: "To process",
              value: matched.data && summarized.data ? count(toProcess) : "…",
              emphasis: true,
            },
          ]}
        />
        {blockedReason && !matched.isPending && !summarized.isPending ? (
          <p className="text-muted-foreground text-xs">{blockedReason}</p>
        ) : null}
        {[matched.error, summarized.error, trigger.error].map((error) =>
          error ? (
            <TopicsErrorMessage key={error.message} message={error.message} />
          ) : null,
        )}
      </Dialog.Body>
    </Dialog>
  );
}

function processBlockedReason({
  hasFacets,
  counting,
  toProcess,
}: {
  hasFacets: boolean;
  counting: boolean;
  toProcess: number;
}) {
  if (!hasFacets) return "Select at least one facet.";
  if (counting) return "Counting traces…";
  if (toProcess === 0) return "Every matching trace is already processed.";
  return null;
}
