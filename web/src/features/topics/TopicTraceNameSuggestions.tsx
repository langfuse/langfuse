import type { FilterState } from "@langfuse/shared";
import { Button } from "@/src/components/design-system/Button/Button";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { compactNumberFormatter } from "@/src/utils/numbers";

const MAX_NAME_CHARACTERS = 28;

// Trace names often share a prefix, so the middle is cut and both ends stay readable.
const shortName = (name: string) =>
  name.length <= MAX_NAME_CHARACTERS
    ? name
    : `${name.slice(0, 16)}…${name.slice(-10)}`;

const isSelected = (filters: FilterState, name: string) =>
  filters.some(
    (filter) =>
      filter.column === "traceName" &&
      filter.type === "stringOptions" &&
      filter.operator === "any of" &&
      filter.value.length === 1 &&
      filter.value[0] === name,
  );

// One name at a time: a click replaces any trace name filter, and a second click clears it.
const selectTraceName = (filters: FilterState, name: string): FilterState => {
  const others = filters.filter((filter) => filter.column !== "traceName");
  if (isSelected(filters, name)) return others;
  return [
    ...others,
    {
      column: "traceName",
      type: "stringOptions",
      operator: "any of",
      value: [name],
    },
  ];
};

type TopicTraceNameSuggestionsProps = {
  /** The project's most used trace names, most used first. */
  names: ReadonlyArray<{ value: string; count: number }>;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
};

/** One-click trace name filters, so a project that traces several agents maps one of them. */
export function TopicTraceNameSuggestions({
  names,
  filters,
  onFiltersChange,
}: TopicTraceNameSuggestionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs">
        Focus this Topics map on one trace name:
      </span>
      {names.map(({ value, count }) => (
        <Tooltip
          key={value}
          label={`${value}\n${compactNumberFormatter(count)} traces in the last 7 days`}
        >
          {({ getTriggerProps }) => (
            <span {...getTriggerProps()}>
              <Button
                text={`${shortName(value)} · ${compactNumberFormatter(count)}`}
                variant="outline"
                size="sm"
                aria-pressed={isSelected(filters, value)}
                onClick={() => onFiltersChange(selectTraceName(filters, value))}
              />
            </span>
          )}
        </Tooltip>
      ))}
    </div>
  );
}
