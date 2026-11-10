import type { FilterState } from "@langfuse/shared";
import type { TopicTimeRange } from "@langfuse/shared/topics";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { env } from "@/src/env.mjs";
import { SampleObservationSelectorBase } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";

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

/** Label and value pairs, e.g. the counts of a processing run. */
function TopicCountList({
  items,
}: {
  items: { label: string; value: string; emphasis?: boolean }[];
}) {
  return (
    <dl className="bg-muted/50 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-md p-3 text-sm">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd
            className={cn(
              "text-right tabular-nums",
              item.emphasis && "font-bold",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** An analysis's tracing filter, with a preview of its matching observations. */
function TopicFilterField({
  projectId,
  timeRange,
  filter,
  onChange,
}: {
  projectId: string;
  timeRange: TopicTimeRange;
  filter: FilterState;
  onChange: (filter: FilterState) => void;
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
      filterTitle="Filter"
      filterDescription={null}
      filterTooltip="Any tracing filter, including scores, latency, cost and negative filters. The analysis clusters summarized traces with an observation matching them."
      matchingDescription="Observations in the analysis window that match the filters."
      matchingTooltip="A trace is in the slice when one of its observations matches."
      formatCount={(count) =>
        `(${compactNumberFormatter(count)} ${count === 1 ? "match" : "matches"})`
      }
      mapObservedOptions={(observed) => observed}
      matchingPreview="collapsible"
    />
  );
}

type TopicFacetOption = {
  id: string;
  name: string;
  description: string;
};

/** The questions a run or analysis answers, as one inline checkbox row. */
function TopicFacetChecklist({
  facets,
  selectedIds,
  onChange,
}: {
  facets: TopicFacetOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <h3 className="text-sm leading-none font-bold">What to look for</h3>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {facets.map((facet) => (
          <label
            key={facet.id}
            className="flex cursor-pointer items-center gap-2 text-sm"
            title={facet.description}
          >
            <Checkbox
              checked={selectedIds.includes(facet.id)}
              aria-label={facet.name}
              onCheckedChange={(next) =>
                onChange(
                  next === true
                    ? [...selectedIds, facet.id]
                    : selectedIds.filter((id) => id !== facet.id),
                )
              }
            />
            {facet.name}
          </label>
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
      <Tabs.List variant="inset" size="md" aria-label="Time window">
        {days.map((day) => (
          <Tabs.Trigger
            key={day}
            value={String(day)}
            label={`Last ${day} days`}
          />
        ))}
      </Tabs.List>
    </Tabs>
  );
}

/** Fields shared by the rule and analysis dialogs. */
export const TopicSliceFields = Object.assign(TopicDialogSection, {
  Section: TopicDialogSection,
  Counts: TopicCountList,
  Filter: TopicFilterField,
  Facets: TopicFacetChecklist,
  Window: TopicWindowTabs,
});
