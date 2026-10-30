import type { ColumnDefinition, FilterState } from "@langfuse/shared";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { cn } from "@/src/utils/tailwind";

const queryOnlyColumnIds = RULE_FIELD_REGISTRY.fields
  .filter((field) => field.directFilter === false)
  .map((field) => field.filterColumn ?? field.id);

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

/** The span filter of a rule, analysis or processing run. */
function TopicFilterField({
  columns,
  filter,
  onChange,
}: {
  columns: ColumnDefinition[];
  filter: FilterState;
  onChange: (filter: FilterState) => void;
}) {
  return (
    <ObservationFilterBuilder
      columns={columns}
      filterState={filter}
      queryOnlyColumnIds={queryOnlyColumnIds}
      onChange={onChange}
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

/** Fields shared by the rule, analysis and Process past traces dialogs. */
export const TopicSliceFields = Object.assign(TopicDialogSection, {
  Section: TopicDialogSection,
  Counts: TopicCountList,
  Filter: TopicFilterField,
  Facets: TopicFacetChecklist,
  Window: TopicWindowTabs,
});
