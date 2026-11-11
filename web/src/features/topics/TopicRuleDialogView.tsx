import type { FilterState } from "@langfuse/shared";
import type { TopicFacet } from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Input } from "@/src/components/design-system/Input/Input";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Slider } from "@/src/components/design-system/Slider/Slider";
import { samplingLabel } from "./topic-maps";
import { TopicTraceFilterSection } from "./TopicTraceFilterSection";
import type { TopicTraceFilterModel } from "./useTopicTraceFilter";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicsErrorMessage } from "./TopicsErrorMessage";

const SAMPLE_MARKS = [1, 25, 50, 75, 100].map((value) => ({
  value,
  label: `${value}%`,
}));

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
  const sampling = Number(samplingPercent) / 100;
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
          <TopicTraceFilterSection
            projectId={projectId}
            filters={filter}
            onFiltersChange={onFilterChange}
            model={traceFilter}
            title="Filter"
            description={null}
            previewDescription={null}
            previewMode="collapsible"
          />
          <TopicSliceFields.Facets
            facets={facets}
            selectedIds={facetIds}
            onChange={onFacetIdsChange}
          />
          <section className="bg-muted flex flex-col gap-4 rounded-lg p-4">
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
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">Sample</span>
                  <span className="text-sm">
                    <span className="font-mono">{samplingLabel(sampling)}</span>
                    {dailyTraces !== null ? (
                      <span className="text-muted-foreground">
                        {` · ~${Math.round(dailyTraces * sampling).toLocaleString("en-US")} new traces / day`}
                      </span>
                    ) : null}
                  </span>
                </div>
                <Slider
                  marks={SAMPLE_MARKS}
                  min={1}
                  max={100}
                  step={1}
                  value={Math.round(Number(samplingPercent)) || 1}
                  aria-label="Sample rate"
                  onValueChange={(value) =>
                    onSamplingPercentChange(String(value))
                  }
                />
              </div>
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
