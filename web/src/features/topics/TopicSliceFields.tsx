import type { ReactNode } from "react";
import type { FilterState } from "@langfuse/shared";
import type { TopicTimeRange } from "@langfuse/shared/topics";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Input } from "@/src/components/design-system/Input/Input";
import { Slider } from "@/src/components/ui/Slider";
import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { env } from "@/src/env.mjs";
import { SampleObservationSelectorBase } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import { compactNumberFormatter } from "@/src/utils/numbers";

/** A labelled block of a Topics slice dialog, e.g. "Traces" or "Facets". */
function TopicDialogSection({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm leading-none font-bold">{label}</h3>
        {description ? (
          <p className="text-muted-foreground text-xs">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** A scan's tracing filter, with the observations it matches in the window. */
function TopicFilterField({
  projectId,
  timeRange,
  filter,
  onChange,
  windowControl,
}: {
  projectId: string;
  timeRange: TopicTimeRange;
  filter: FilterState;
  onChange: (filter: FilterState) => void;
  /** Shown at the right of the matching-observations header. */
  windowControl: ReactNode;
}) {
  return (
    <SampleObservationSelectorBase
      projectId={projectId}
      timeRange={timeRange}
      filterState={filter}
      onFilterStateChange={onChange}
      previewFilters={filter}
      tableName="topics-analysis-matching-spans"
      // Analyses filter like the tracing table, so they take its full registry.
      registry={undefined}
      selectedObservationId={null}
      onSelect={() => undefined}
      onOpenTrace={(observation) => {
        if (!observation.traceId) return;
        window.open(
          `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/project/${projectId}/traces/${observation.traceId}?observation=${observation.id}`,
          "_blank",
          "noopener,noreferrer",
        );
      }}
      leadingColumns={[]}
      resolveSelection={() => undefined}
      getRowClassName={undefined}
      filterTitle="Filter traces"
      filterDescription="A trace matches when one of its observations meets every filter."
      filterTooltip="Any tracing filter, including scores, latency, cost and negative filters. The scan clusters summarized traces with an observation matching them."
      matchingDescription="Observations in the scan window that match the filters."
      matchingTooltip="A trace is in the slice when one of its observations matches."
      formatCount={(count) => compactNumberFormatter(count)}
      mapObservedOptions={(observed) => observed}
      matchingTrailing={windowControl}
    />
  );
}

type TopicFacetOption = {
  id: string;
  name: string;
  description: string;
};

/** The questions a scan answers, one row each with its description. */
function TopicFacetChecklist({
  facets,
  selectedIds,
  onChange,
  disabled,
}: {
  facets: TopicFacetOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-bold">What to look for</h3>
      <div className="divide-y rounded-md border">
        {facets.map((facet) => (
          <div
            key={facet.id}
            className="grid grid-cols-[16px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 px-3 py-2.5 sm:grid-cols-[16px_96px_minmax(0,1fr)]"
          >
            <Checkbox
              checked={selectedIds.includes(facet.id)}
              disabled={disabled}
              aria-label={facet.name}
              onCheckedChange={(next) =>
                onChange(
                  next === true
                    ? [...selectedIds, facet.id]
                    : selectedIds.filter((id) => id !== facet.id),
                )
              }
            />
            <span className="text-sm font-bold">{facet.name}</span>
            <span className="text-muted-foreground col-start-2 text-sm sm:col-start-auto">
              {facet.description}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Day windows ending now, e.g. last 7 or 30 days. */
function TopicWindowTabs({
  days,
  value,
  onChange,
}: {
  days: readonly number[];
  value: number;
  onChange: (days: number) => void;
}) {
  return (
    <Tabs
      value={String(value)}
      onValueChange={(next) => onChange(Number(next))}
    >
      <Tabs.List variant="inset" size="sm" aria-label="Time window">
        {days.map((day) => (
          <Tabs.Trigger key={day} value={String(day)} label={`Last ${day}d`} />
        ))}
      </Tabs.List>
    </Tabs>
  );
}

function dailyEstimate(dailyTraces: number, samplePercent: number) {
  const perDay = (dailyTraces * samplePercent) / 100;
  if (perDay > 0 && perDay < 1) return "<1";
  return Math.round(perDay).toLocaleString("en-US");
}

function samplePercentFromInput(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const percent = Number(value);
  if (percent < 1 || percent > 100) return null;
  return percent;
}

function dailyVolumeLabel(perDay: string) {
  if (perDay === "<1") return "<1 new trace / day";
  return `~${perDay} new ${perDay === "1" ? "trace" : "traces"} / day`;
}

/** One row: the share of matching traces a scan analyzes, with its daily volume. */
function TopicSamplingField({
  value,
  onChange,
  dailyTraces,
  disabled,
  tooltip,
}: {
  value: number;
  onChange: (percent: number) => void;
  /** Matching traces per day; null while unknown. */
  dailyTraces: number | null;
  disabled?: boolean;
  tooltip: string;
}) {
  const perDay =
    dailyTraces === null ? null : dailyEstimate(dailyTraces, value);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <SectionHeader
        title="Sampling rate"
        meta={null}
        description={null}
        tooltip={tooltip}
        trailing={null}
      />
      <div className="flex items-center gap-2">
        <div className="w-32">
          <Slider
            min={1}
            max={100}
            step={1}
            value={[value]}
            aria-label="Sampling rate"
            disabled={disabled}
            onValueChange={(next) => onChange(next[0] ?? value)}
          />
        </div>
        <div className="w-16">
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            aria-label="Sampling rate percent"
            value={String(value)}
            disabled={disabled}
            onChange={(event) => {
              const percent = samplePercentFromInput(event.target.value);
              if (percent !== null) onChange(percent);
            }}
          />
        </div>
        <span className="text-muted-foreground text-sm">
          %{perDay === null ? null : ` · ${dailyVolumeLabel(perDay)}`}
        </span>
      </div>
    </div>
  );
}

/** Fields shared by the rule and analysis dialogs. */
export const TopicSliceFields = Object.assign(TopicDialogSection, {
  Section: TopicDialogSection,
  Filter: TopicFilterField,
  Facets: TopicFacetChecklist,
  Window: TopicWindowTabs,
  Sampling: TopicSamplingField,
});
