import type { FilterState } from "@langfuse/shared";
import type { TopicFacet } from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { TopicTraceFilterSection } from "./TopicTraceFilterSection";
import type { TopicTraceFilterModel } from "./useTopicTraceFilter";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicsErrorMessage } from "./TopicsErrorMessage";

/** The Edit scan dialog without data fetching; stories render it directly. */
export function TopicRuleDialogView({
  projectId,
  facets,
  name: ruleName,
  onNameChange,
  filter,
  onFilterChange,
  traceFilter,
  filterError,
  facetIds,
  onFacetIdsChange,
  paused,
  onPausedChange,
  samplingPercent,
  onSamplingPercentChange,
  dailyTraces,
  canSave,
  readOnlyReason,
  saving,
  saveError,
  onSave,
}: TopicRuleDialogViewProps) {
  const readOnly = readOnlyReason !== undefined;
  return (
    <Dialog
      title="Edit scan"
      size="md"
      actions={[
        {
          label: "Save changes",
          disabled: readOnly || !canSave,
          disabledReason: readOnlyReason,
          loading: saving,
          onClick: onSave,
        },
      ]}
    >
      <Dialog.Body separators="both">
        <div className="ph-no-capture flex flex-col gap-6">
          {readOnly ? (
            <p className="text-muted-foreground text-sm">
              View only. {readOnlyReason}
            </p>
          ) : null}
          <TopicSliceFields.Section label="Name">
            <Input
              aria-label="Scan name"
              value={ruleName}
              maxLength={100}
              disabled={readOnly}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </TopicSliceFields.Section>
          <TopicSliceFields.Facets
            facets={facets}
            selectedIds={facetIds}
            onChange={onFacetIdsChange}
            disabled={readOnly}
          />
          {/* The filter editor has no disabled mode; the view-only note and Save cover it. */}
          <TopicTraceFilterSection
            projectId={projectId}
            filters={filter}
            onFiltersChange={onFilterChange}
            model={traceFilter}
          />
          <TopicSliceFields.AutoAnalyze
            on={!paused}
            onChange={(on) => onPausedChange(!on)}
            disabled={readOnly}
          >
            <TopicSliceFields.Sampling
              value={samplingPercent}
              onChange={onSamplingPercentChange}
              dailyTraces={dailyTraces}
              tooltip="Share of new matching traces this scan analyzes."
              disabled={readOnly}
            />
          </TopicSliceFields.AutoAnalyze>
          {filterError && filter.length ? (
            <TopicsErrorMessage message={filterError} />
          ) : null}
          {saveError ? <TopicsErrorMessage message={saveError} /> : null}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}

type TopicRuleDialogViewProps = {
  projectId: string;
  facets: TopicFacet[];
  name: string;
  onNameChange: (name: string) => void;
  filter: FilterState;
  onFilterChange: (filter: FilterState) => void;
  traceFilter: TopicTraceFilterModel;
  filterError: string | null;
  facetIds: string[];
  onFacetIdsChange: (facetIds: string[]) => void;
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
  samplingPercent: number;
  onSamplingPercentChange: (percent: number) => void;
  /** Matching traces per day over the last week; null while unknown. */
  dailyTraces: number | null;
  canSave: boolean;
  /** Why the viewer can't change this scan; set, the fields are disabled and Save explains it. */
  readOnlyReason?: string;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
};
