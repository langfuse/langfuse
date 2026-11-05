import type { FilterState } from "@langfuse/shared";
import {
  TOPICS_RULE_FILTER_COLUMNS,
  topicRuleFilterError,
  type TopicTimeRange,
} from "@langfuse/shared/topics";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { env } from "@/src/env.mjs";
import { RULE_SAMPLE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import { SampleObservationSelectorBase } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";

const ruleColumns: readonly string[] = TOPICS_RULE_FILTER_COLUMNS;
// Rules match during ingestion, so their query only offers the matcher's fields.
const ruleRegistry = {
  ...RULE_SAMPLE_FIELD_REGISTRY,
  fields: RULE_SAMPLE_FIELD_REGISTRY.fields.filter((field) =>
    ruleColumns.includes(field.filterColumn ?? field.id),
  ),
  columns: RULE_SAMPLE_FIELD_REGISTRY.columns.filter((column) =>
    ruleColumns.includes(column.id),
  ),
  filterStateErrors: (filter: FilterState) => {
    const error = topicRuleFilterError(filter);
    return error ? [error] : [];
  },
};

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

/** The observation filter of a rule or analysis, with a preview of its matches. */
function TopicFilterField({
  projectId,
  scope,
  timeRange,
  filter,
  onChange,
}: {
  projectId: string;
  scope: "rule" | "analysis";
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
      tableName={`topics-${scope}-matching-spans`}
      // Analyses filter like the tracing table, so they take its full registry.
      registry={scope === "rule" ? ruleRegistry : undefined}
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
      filterDescription={
        scope === "rule"
          ? "A trace matches when one of its observations meets every filter."
          : "Any tracing filter, including scores, latency, cost and negative filters."
      }
      filterTooltip={
        scope === "rule"
          ? "Only new traces matching these filters are summarized and assigned by this rule."
          : "The analysis clusters summarized traces with an observation matching these filters."
      }
      matchingDescription={
        scope === "rule"
          ? "Observations from the last seven days that match the filters."
          : "Observations in the analysis window that match the filters."
      }
      matchingTooltip="A trace is in the slice when one of its observations matches."
      formatCount={(count) =>
        `(${compactNumberFormatter(count)} ${count === 1 ? "match" : "matches"})`
      }
      mapObservedOptions={(observed) => observed}
    />
  );
}

type TopicFacetOption = {
  id: string;
  name: string;
  description: string;
};

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
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="sr-only">Facets</legend>
      <div className="flex flex-wrap gap-2">
        {facets.map((facet) => {
          const selected = selectedIds.includes(facet.id);
          return (
            <label
              key={facet.id}
              title={facet.description}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-2 text-sm transition-colors",
                selected
                  ? "border-border-contrast bg-secondary"
                  : "border-input text-muted-foreground hover:bg-accent",
              )}
            >
              <Checkbox
                aria-label={facet.name}
                checked={selected}
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true
                      ? [...selectedIds, facet.id]
                      : selectedIds.filter((id) => id !== facet.id),
                  )
                }
              />
              <span className="font-bold">{facet.name}</span>
            </label>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        {selectedIds.length} of {facets.length} selected
      </p>
    </fieldset>
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
