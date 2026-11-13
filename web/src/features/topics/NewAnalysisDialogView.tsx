import type { ReactNode } from "react";
import { Clock, Layers, Radio } from "@langfuse/icons";
import {
  TOPICS_SLICE_MAX_TRACES,
  type TopicFacet,
} from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicsErrorMessage } from "./TopicsErrorMessage";

const count = (value: number) => value.toLocaleString("en-US");

/** The New scan dialog without data fetching; stories render it directly. */
export function NewAnalysisDialogView({
  name,
  onNameChange,
  filterField,
  facets,
  facetIds,
  onFacetIdsChange,
  live,
  onLiveChange,
  liveDisabledReason,
  samplingField,
  preview,
  canStart,
  starting,
  errors,
  onStart,
}: NewAnalysisDialogViewProps) {
  return (
    <Dialog
      title="New scan"
      size="md"
      actions={[
        {
          label: live ? "Start live scan" : "Start one-off scan",
          disabled: !canStart,
          loading: starting,
          onClick: onStart,
        },
      ]}
    >
      <Dialog.Body separators="both">
        <div className="ph-no-capture flex flex-col gap-6">
          <TopicSliceFields.Section label="Name">
            <Input
              aria-label="Scan name"
              value={name}
              maxLength={100}
              onChange={(event) => onNameChange(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Suggested from the filters until you edit it.
            </p>
          </TopicSliceFields.Section>
          <TopicSliceFields.Facets
            facets={facets}
            selectedIds={facetIds}
            onChange={onFacetIdsChange}
          />
          {filterField}
          <TopicSliceFields.AutoAnalyze
            on={live}
            onChange={onLiveChange}
            disabledReason={liveDisabledReason}
          >
            {samplingField}
          </TopicSliceFields.AutoAnalyze>
          {live ? <LiveScanSummary /> : <ScanSummary preview={preview} />}
          {errors.map((message) => (
            <TopicsErrorMessage key={message} message={message} />
          ))}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}

/** A live scan has no past traces to group yet; its first map comes from the nightly refit. */
function LiveScanSummary() {
  return (
    <div className="bg-light-blue text-dark-blue flex items-center gap-2 rounded-md px-4 py-2.5 text-sm">
      <Radio size="base" aria-hidden="true" />
      Analyzes new matching traces as they arrive. First topics appear after the
      nightly update.
    </div>
  );
}

/** What the scan will group, or why it can't start yet. */
function ScanSummary({
  preview,
}: {
  preview: NewAnalysisDialogViewProps["preview"];
}) {
  if (preview && !preview.ready)
    return (
      <div className="bg-light-yellow text-dark-yellow rounded-md px-4 py-2.5 text-sm">
        Only {count(preview.summarizedCount)} summarized{" "}
        {preview.summarizedCount === 1 ? "trace" : "traces"}. A scan needs at
        least {count(preview.minimumTraceCount)}.
      </div>
    );
  return (
    <div className="bg-light-blue text-dark-blue flex flex-col gap-1.5 rounded-md px-4 py-2.5 text-sm">
      <span className="flex items-center gap-2">
        <Layers size="base" aria-hidden="true" />
        {preview
          ? `${count(preview.summarizedCount)} summarized traces will be grouped (random sample of at most ${count(TOPICS_SLICE_MAX_TRACES)})`
          : "Counting summarized traces…"}
      </span>
      <span className="flex items-center gap-2">
        <Clock size="base" aria-hidden="true" />
        Runs once. Live topic maps don’t change.
      </span>
    </div>
  );
}

type NewAnalysisDialogViewProps = {
  name: string;
  onNameChange: (name: string) => void;
  /** The tracing filter with its matching preview and time window. */
  filterField: ReactNode;
  facets: TopicFacet[];
  facetIds: string[];
  onFacetIdsChange: (facetIds: string[]) => void;
  /** Auto-analyze on: the scan becomes a live rule instead of a one-off run. */
  live: boolean;
  onLiveChange: (live: boolean) => void;
  liveDisabledReason?: string;
  /** The sample rate, shown while auto-analyze is on. */
  samplingField: ReactNode;
  /** Counts for the current slice; null while they load. */
  preview: {
    matchedTraceCount: number;
    summarizedCount: number;
    minimumTraceCount: number;
    ready: boolean;
  } | null;
  canStart: boolean;
  starting: boolean;
  errors: string[];
  onStart: () => void;
};
