import type { FilterState } from "@langfuse/shared";
import type { TopicFacet } from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Input } from "@/src/components/design-system/Input/Input";
import { Switch } from "@/src/components/design-system/Switch/Switch";
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
  saving,
  saveError,
  onSave,
}: TopicRuleDialogViewProps) {
  return (
    <Dialog
      title="Edit scan"
      size="md"
      actions={[
        {
          label: "Save changes",
          disabled: !canSave,
          loading: saving,
          onClick: onSave,
        },
      ]}
    >
      <Dialog.Body separators="both">
        <div className="ph-no-capture flex flex-col gap-6">
          <TopicSliceFields.Section label="Name">
            <Input
              aria-label="Scan name"
              value={ruleName}
              maxLength={100}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </TopicSliceFields.Section>
          <TopicSliceFields.Facets
            facets={facets}
            selectedIds={facetIds}
            onChange={onFacetIdsChange}
          />
          <TopicTraceFilterSection
            projectId={projectId}
            filters={filter}
            onFiltersChange={onFilterChange}
            model={traceFilter}
          />
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <label
                    htmlFor="topics-run-auto-analyze"
                    className="text-sm leading-none font-bold"
                  >
                    Auto-analyze
                  </label>
                  {paused ? null : (
                    <Badge text="LIVE" size="sm" color="success" />
                  )}
                </span>
                <p className="text-muted-foreground text-sm">
                  Analyze new matching traces as they arrive.
                </p>
              </div>
              <Switch
                id="topics-run-auto-analyze"
                checked={!paused}
                onCheckedChange={(on) => onPausedChange(!on)}
              />
            </div>
            {paused ? null : (
              <TopicSliceFields.Sampling
                value={Math.round(Number(samplingPercent)) || 1}
                onChange={(percent) => onSamplingPercentChange(String(percent))}
                dailyTraces={dailyTraces}
                tooltip="Share of new matching traces this scan analyzes."
              />
            )}
          </section>
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
  samplingPercent: string;
  onSamplingPercentChange: (percent: string) => void;
  /** Matching traces per day over the last week; null while unknown. */
  dailyTraces: number | null;
  canSave: boolean;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
};
