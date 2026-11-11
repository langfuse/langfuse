import type { ReactNode } from "react";
import {
  TOPICS_SLICE_MAX_TRACES,
  type TopicFacet,
} from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicsErrorMessage } from "./TopicsErrorMessage";

const windows = [7, 30] as const;
const count = (value: number) => value.toLocaleString("en-US");

/** The New scan dialog without data fetching; stories render it directly. */
export function NewAnalysisDialogView({
  name,
  onNameChange,
  filterField,
  facets,
  facetIds,
  onFacetIdsChange,
  days,
  onDaysChange,
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
          label: "Start scan",
          disabled: !canStart,
          loading: starting,
          onClick: onStart,
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
              onChange={(event) => onNameChange(event.target.value)}
            />
          </TopicSliceFields.Section>
          {filterField}
          <TopicSliceFields.Facets
            facets={facets}
            selectedIds={facetIds}
            onChange={onFacetIdsChange}
          />
          <TopicSliceFields.Section label="Window">
            <TopicSliceFields.Window
              days={windows}
              value={days}
              onChange={onDaysChange}
            />
          </TopicSliceFields.Section>
          <TopicSliceFields.Counts
            items={[
              {
                label: "Matching traces",
                value: preview ? count(preview.matchedTraceCount) : "…",
              },
              {
                label: `Summarized, will be clustered (random sample of at most ${count(TOPICS_SLICE_MAX_TRACES)})`,
                value: preview ? count(preview.summarizedCount) : "…",
                emphasis: true,
              },
            ]}
          />
          {preview && !preview.ready ? (
            <p className="text-muted-foreground text-sm">
              A scan needs at least {count(preview.minimumTraceCount)}{" "}
              summarized traces in this slice.
            </p>
          ) : null}
          {errors.map((message) => (
            <TopicsErrorMessage key={message} message={message} />
          ))}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}

type NewAnalysisDialogViewProps = {
  name: string;
  onNameChange: (name: string) => void;
  /** The tracing filter with its matching-observations preview. */
  filterField: ReactNode;
  facets: TopicFacet[];
  facetIds: string[];
  onFacetIdsChange: (facetIds: string[]) => void;
  days: number;
  onDaysChange: (days: number) => void;
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
