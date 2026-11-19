import { useId, useState, type ReactNode } from "react";
import { Search } from "@langfuse/icons";
import { Button as DsButton } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { rankFacetOptions } from "@/src/features/filters/lib/facet-display";
import { type TextFilterEntry } from "@/src/features/filters/hooks/useSidebarFilterState";
import { cn } from "@/src/utils/tailwind";
import { compactNumberFormatter } from "@/src/utils/numbers";

export interface CategoricalFilterContentProps {
  filterKey: string;
  tableName: string | undefined;
  loading?: boolean;
  mode: "select" | "text";
  onModeChange: (mode: "select" | "text") => void;
  options: string[];
  counts: Map<string, number>;
  displayByValue?: Map<string, string>;
  value: string[];
  onChange: (values: string[]) => void;
  onOnlyChange?: (value: string) => void;
  renderIcon?: (value: string) => ReactNode;
  renderOptionSuffix?: (value: string) => ReactNode;
  getOptionTitle?: (value: string, displayLabel: string) => string;
  operator?: "any of" | "all of" | "none of";
  onOperatorChange?: (operator: "any of" | "all of" | "none of") => void;
  textFilters?: TextFilterEntry[];
  onTextFilterAdd?: (
    operator: "contains" | "does not contain",
    value: string,
  ) => void;
  onTextFilterRemove?: (
    operator: "contains" | "does not contain",
    value: string,
  ) => void;
}

export function CategoricalFilterContent({
  filterKey,
  tableName,
  loading,
  mode,
  onModeChange,
  options,
  counts,
  displayByValue,
  value,
  onChange,
  onOnlyChange,
  renderIcon,
  renderOptionSuffix,
  getOptionTitle,
  operator,
  onOperatorChange,
  textFilters,
  onTextFilterAdd,
  onTextFilterRemove,
}: CategoricalFilterContentProps) {
  return (
    <div className="flex flex-col">
      {onTextFilterAdd && (
        <div className="mt-1 mb-2 px-3">
          <FilterModeTabs mode={mode} onModeChange={onModeChange} />
        </div>
      )}
      {mode === "select" && (
        <CategoricalSelectContent
          filterKey={filterKey}
          tableName={tableName ?? "data"}
          loading={loading}
          options={options}
          counts={counts}
          displayByValue={displayByValue}
          value={value}
          onChange={onChange}
          onOnlyChange={onOnlyChange}
          renderIcon={renderIcon}
          renderOptionSuffix={renderOptionSuffix}
          getOptionTitle={getOptionTitle}
          operator={operator}
          onOperatorChange={onOperatorChange}
        />
      )}
      {mode === "text" && onTextFilterAdd && (
        <div className="py-1">
          <TextFilterSection
            allFilters={textFilters ?? []}
            onAdd={onTextFilterAdd}
            onRemove={onTextFilterRemove}
          />
        </div>
      )}
    </div>
  );
}

// Values shown per facet before "Show more values" gates the rest.
const MAX_VISIBLE_OPTIONS = 12;
// Each "Show more values" click reveals this many additional values.
const SHOW_MORE_INCREMENT = 50;

// Select-mode body of a categorical facet. A separate stateful child so its
// transient list UI state (value search, "show more") lives inside the
// accordion content and unmounts — and therefore resets — when the facet is
// collapsed (Radix unmounts closed content), instead of a reset effect in
// the always-mounted facet wrapper.
function CategoricalSelectContent({
  filterKey,
  tableName,
  loading,
  options,
  counts,
  displayByValue,
  value,
  onChange,
  onOnlyChange,
  renderIcon,
  renderOptionSuffix,
  getOptionTitle,
  operator,
  onOperatorChange,
}: Pick<
  CategoricalFilterContentProps,
  | "filterKey"
  | "tableName"
  | "loading"
  | "options"
  | "counts"
  | "displayByValue"
  | "value"
  | "onChange"
  | "onOnlyChange"
  | "renderIcon"
  | "renderOptionSuffix"
  | "getOptionTitle"
  | "operator"
  | "onOperatorChange"
>) {
  const instanceId = useId();
  // "Show more values" reveals the next PORTION (it does what it says — not
  // expand-everything: value lists can run to 1000+ user IDs); "Show fewer
  // values" collapses back to the cap. Resets by unmounting on collapse.
  const [visibleCount, setVisibleCount] = useState(MAX_VISIBLE_OPTIONS);
  const handleShowFewerValues = () => {
    setVisibleCount(MAX_VISIBLE_OPTIONS);
  };
  const handleShowMoreValues = () => {
    setVisibleCount((current) => current + SHOW_MORE_INCREMENT);
  };
  const [searchQuery, setSearchQuery] = useState("");
  const visibleOptionValues = Array.from(
    new Set([...options, ...value.filter((option) => option.length > 0)]),
  );
  const hasMoreOptions = visibleOptionValues.length > MAX_VISIBLE_OPTIONS;

  // Filter options by search query (raw value and display label), ranked the
  // way the search bar ranks its completions: prefix matches before
  // substring matches, instead of plain unordered substring filtering.
  const filteredOptions = searchQuery
    ? rankFacetOptions(visibleOptionValues, searchQuery, displayByValue)
    : visibleOptionValues;

  // Order the applied filter to the top of the list so it is immediately
  // visible — without scrolling or expanding "Show more" — even when its
  // value sits far down a long list. The rows carrying the
  // applied filter are the CHECKED values for a positive selection, but the
  // UNCHECKED (excluded) values for a `none of` filter: under the
  // checked=kept display model the checked set is the complement of the
  // exclusions, and pinning that complement would sink the
  // just-unchecked row below the cap.
  //
  // Two guards keep this honest:
  //   1. Only reorder long lists (more options than the cap) that carry a real,
  //      strict-subset selection. `value` mirrors the hook's
  //      `computeSelectedValues`, which reports EVERY option as "selected" when
  //      no filter is applied (and the kept complement for `none of`).
  //      Requiring a strict subset skips that all-selected default — otherwise
  //      the whole list would be treated as pinned — and leaves short lists
  //      untouched.
  //   2. The visible-count cap is applied to the COMBINED ordered list, so even
  //      a large pinned set (many selected values, or many exclusions) can
  //      never render the entire list; "Show more" still gates the overflow.
  const selectedSet = new Set(value);
  const pinnedSet =
    operator === "none of"
      ? new Set(
          visibleOptionValues.filter((option) => !selectedSet.has(option)),
        )
      : selectedSet;
  // While searching, rankFacetOptions owns the order (prefix matches first);
  // pinning checked rows above better matches would fight it.
  const pinApplied =
    !searchQuery &&
    hasMoreOptions &&
    value.length > 0 &&
    value.length < visibleOptionValues.length;
  const orderedOptions = pinApplied
    ? [
        ...filteredOptions.filter((option) => pinnedSet.has(option)),
        ...filteredOptions.filter((option) => !pinnedSet.has(option)),
      ]
    : filteredOptions;

  const visibleOptions = orderedOptions.slice(0, visibleCount);
  const canShowMore = orderedOptions.length > visibleCount;
  const canShowFewer = visibleCount > MAX_VISIBLE_OPTIONS;

  // Split the visible slice so a separator can mark where the pinned rows
  // end. When not pinning, everything renders in natural order (no divider).
  const visiblePinnedOptions = pinApplied
    ? visibleOptions.filter((option) => pinnedSet.has(option))
    : [];
  const visibleRemainingOptions = pinApplied
    ? visibleOptions.filter((option) => !pinnedSet.has(option))
    : visibleOptions;

  const renderOption = (option: string) => {
    const displayLabel = displayByValue?.get(option) ?? option;
    return (
      <FilterValueCheckbox
        key={option}
        id={`${instanceId}-${option}`}
        label={displayLabel}
        title={getOptionTitle?.(option, displayLabel)}
        icon={renderIcon?.(option)}
        suffix={renderOptionSuffix?.(option)}
        count={counts.get(option) || 0}
        checked={value.includes(option)}
        onCheckedChange={(checked) => {
          const newValues = checked
            ? [...value, option]
            : value.filter((v: string) => v !== option);
          onChange(newValues);
        }}
        onLabelClick={onOnlyChange ? () => onOnlyChange(option) : undefined}
        totalSelected={value.length}
      />
    );
  };

  return (
    <div className="px-3">
      {/* Any of / All of / None of operator toggle for arrayOptions filters

          This toggle appears for multi-valued array columns (arrayOptions)
          like tags. It switches between the supported array matching modes:
          - Any of: match items with ANY selected value (OR logic)
          - All of: match items with ALL selected values (AND logic)
          - None of: exclude items carrying any UNCHECKED value (the filter
            stores the exclusions; checkboxes show the kept complement)

          Toggling between modes carries the stored value list over, so
          any-of "match a or b" becomes none-of "exclude a and b" — the
          checked set visually flips to its complement.

          None-of mode usually engages by itself: unchecking a value from
          the all-checked default persists `none of [value]`. The toggle
          remains for converting an existing selection or persisting an
          operator preference before any values are selected. Other
          filter types (stringOptions, boolean, numeric) don't get this
          toggle because these array-specific modes are not semantically
          meaningful there.

          Currently enabled for:
          - Traces: tags
          - Sessions: userIds, tags
          - Prompts: labels, tags
          - Monitors: tags
      */}
      {onOperatorChange && (
        <div className="mb-2">
          <Tabs
            value={operator ?? "any of"}
            onValueChange={(newOperator) =>
              onOperatorChange(newOperator as "any of" | "all of" | "none of")
            }
          >
            <Tabs.List variant="inset" layout="full" size="sm">
              <Tabs.Trigger value="any of" label="Any of" />
              <Tabs.Trigger value="all of" label="All of" />
              {/* Without a persisted selection, switching to "none of" is a
                  deliberate no-op in the state model (an empty exclusion
                  would persist a vacuous filter). It enables as soon as
                  any selection exists, and NONE mode
                  engages by itself when a value is unchecked. */}
              {operator === undefined ? (
                <Tooltip
                  delay={80}
                  label="Nothing to exclude yet — uncheck a value to exclude it, or select values first."
                >
                  {({ getTriggerProps }) => (
                    <span {...getTriggerProps()} className="w-full min-w-0">
                      <Tabs.Trigger value="none of" disabled label="None of" />
                    </span>
                  )}
                </Tooltip>
              ) : (
                <span className="w-full min-w-0">
                  <Tabs.Trigger value="none of" label="None of" />
                </span>
              )}
            </Tabs.List>
          </Tabs>
        </div>
      )}

      {/* Loading / Empty / Options */}
      {loading && (
        <>
          {[1, 2].map((i) => (
            <div key={i} className="relative flex items-center">
              <div className="flex min-w-0 flex-1 items-center rounded-md px-2 py-0.5">
                <Skeleton className="h-3.5 w-3.5 rounded-sm" />
                <div className="flex min-w-0 flex-1 items-center pr-1 pl-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="ml-auto h-3 w-8" />
                </div>
              </div>
            </div>
          ))}
        </>
      )}
      {!loading && visibleOptionValues.length === 0 && (
        // px-2 on top of the outer px-3 = the checkbox rows' inset, so empty
        // states don't stick to the panel edge.
        <div className="text-muted-foreground px-2 py-1 text-xs">
          {categoricalEmptyMessage(filterKey, tableName)}
        </div>
      )}
      {!loading && visibleOptionValues.length > 0 && (
        <>
          {/* Search box for many options */}
          {hasMoreOptions && (
            <div className="mb-2">
              <div className="relative">
                <Search
                  size="base"
                  color="muted"
                  __rawClassName="absolute top-1/2 left-2 -translate-y-1/2"
                />
                <Input
                  placeholder="Filter values"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-7 font-mono text-xs"
                />
              </div>
            </div>
          )}

          {/* Checkbox list */}
          {filteredOptions.length === 0 ? (
            <div className="text-muted-foreground py-1 text-center text-sm">
              No matches found
            </div>
          ) : (
            <>
              {/* Applied-filter rows (selected, or excluded under
                        `none of`), pinned to the top (long lists only) */}
              {visiblePinnedOptions.map(renderOption)}

              {/* Separator between the pinned rows and the rest */}
              {visiblePinnedOptions.length > 0 &&
                visibleRemainingOptions.length > 0 && (
                  <div
                    className="border-border/60 mx-3 my-1 border-t"
                    aria-hidden
                  />
                )}

              {/* Remaining options, capped */}
              {visibleRemainingOptions.map(renderOption)}
              {(canShowMore || canShowFewer) && (
                <div className="mt-1 flex flex-col items-start gap-1 py-1 pl-2">
                  {canShowFewer && (
                    <DsButton
                      variant="text"
                      size="sm"
                      text="Show fewer values"
                      onClick={handleShowFewerValues}
                    />
                  )}
                  {canShowMore && (
                    <DsButton
                      variant="text"
                      size="sm"
                      text="Show more values"
                      onClick={handleShowMoreValues}
                    />
                  )}
                </div>
              )}
            </>
          )}
          {filterKey === "environment" &&
          visibleOptionValues.length === 1 &&
          visibleOptionValues[0]?.toLowerCase() === "default" ? (
            <div className="text-muted-foreground mt-2 px-2 text-xs">
              <a
                href="https://langfuse.com/docs/observability/features/environments"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground underline"
              >
                See docs
              </a>{" "}
              on how to add environments to your {tableName}.
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// Filter mode tabs for switching between Select (checkboxes) and Text (contains) modes
interface FilterModeTabsProps {
  mode: "select" | "text";
  onModeChange: (mode: "select" | "text") => void;
}

function FilterModeTabs({ mode, onModeChange }: FilterModeTabsProps) {
  return (
    <Tabs
      value={mode}
      onValueChange={(newMode) => onModeChange(newMode as "select" | "text")}
    >
      <Tabs.List variant="inset" layout="full" size="sm">
        <Tabs.Trigger value="select" label="Select" />
        <Tabs.Trigger value="text" label="Text" />
      </Tabs.List>
    </Tabs>
  );
}

// Text filter section for categorical filters
// Single input with DOES/DOES NOT toggle, allows adding multiple filters
function TextFilterSection({
  allFilters,
  onAdd,
  onRemove,
}: {
  allFilters: TextFilterEntry[];
  onAdd?: (op: "contains" | "does not contain", val: string) => void;
  onRemove?: (op: "contains" | "does not contain", val: string) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [selectedOperator, setSelectedOperator] = useState<
    "contains" | "does not contain"
  >("contains");

  const handleAdd = () => {
    // people have filtered for a single " ", e.g. does not contain " " on sessionID to get all traces with a session id
    if (inputValue.length > 0 && onAdd) {
      onAdd(selectedOperator, inputValue);
      setInputValue("");
    }
  };

  return (
    <div className="space-y-2">
      {/* Operator picker */}
      <div className="px-3">
        <Select
          value={selectedOperator}
          onValueChange={(operator) =>
            setSelectedOperator(operator as "contains" | "does not contain")
          }
        >
          <SelectTrigger className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contains" className="text-xs">
              contains
            </SelectItem>
            <SelectItem value="does not contain" className="text-xs">
              does not contain
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Input + Add button */}
      <div className="flex items-center gap-2 px-3">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Enter value..."
          className="h-7 flex-1 text-xs"
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={handleAdd}
          disabled={inputValue.length === 0}
          className="h-7 shrink-0 px-2 text-xs"
        >
          Add
        </Button>
      </div>

      {/* Active filters list */}
      {allFilters.length > 0 && (
        <div className="space-y-1 px-3">
          {allFilters.map((f, idx) => (
            <div
              key={idx}
              className="group/textfilter border-border/40 bg-muted/30 flex items-center gap-2 rounded border px-2 py-1 text-xs"
            >
              <span className="text-muted-foreground shrink-0 text-[11px] font-bold">
                {f.operator === "contains" ? "contains" : "does not contain"}
              </span>
              <span
                className="min-w-0 flex-1 truncate font-bold"
                title={f.value}
              >
                {f.value}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemove?.(f.operator, f.value)}
                className="text-muted-foreground hover:text-foreground h-4 w-4 shrink-0 p-0 opacity-0 transition-opacity group-hover/textfilter:opacity-100"
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FilterValueCheckboxProps {
  id: string;
  label: string;
  title?: string;
  icon?: ReactNode;
  suffix?: ReactNode;
  count: number;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onLabelClick?: () => void; // For "only this" behavior
  totalSelected?: number;
  disabled?: boolean;
}

function FilterValueCheckbox({
  id,
  label,
  title,
  icon,
  suffix,
  count,
  checked = false,
  onCheckedChange,
  onLabelClick,
  totalSelected,
  disabled = false,
}: FilterValueCheckboxProps) {
  // Show "All" when clicking would reverse selection (only one item selected)
  const labelText = checked && totalSelected === 1 ? "All" : "Only";

  // Display placeholder for empty strings to ensure clickable area
  const displayLabel = label === "" ? "(empty)" : label;
  const displayTitle = title ?? (label === "" ? "(empty)" : label);

  return (
    <div
      className={cn(
        "relative flex items-center",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {/* One hover tint for the whole row, same inset as the header box above. */}
      <div className="hover:bg-accent flex min-w-0 flex-1 items-center rounded-md px-2 py-0.5 transition-colors">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          size="sm"
        />

        {/* Label area: clicking selects only this value */}
        <div
          className={cn(
            "group/label flex min-w-0 flex-1 cursor-pointer items-center self-stretch pr-1 pl-2",
            disabled && "pointer-events-none",
          )}
          onClick={onLabelClick}
        >
          {icon ? <span className="mr-2">{icon}</span> : null}
          <span
            className={cn(
              "text-foreground-secondary min-w-0 truncate text-xs",
              !suffix && "flex-1",
              label === "" && "text-muted-foreground italic",
            )}
            title={displayTitle}
          >
            {displayLabel}
          </span>
          {suffix ? <span className="shrink-0 pl-1">{suffix}</span> : null}

          {/* "Only" or "All" indicator when hovering label. shrink-0 +
              whitespace-nowrap: appearing may only re-truncate the label —
              never widen the row. */}
          {onLabelClick && !disabled && (
            <span className="text-muted-foreground hidden shrink-0 pl-1 text-xs whitespace-nowrap group-hover/label:block">
              {labelText}
            </span>
          )}

          {count > 0 ? (
            <span className="text-muted-foreground ml-auto w-7 shrink-0 pl-1 text-right text-xs">
              {compactNumberFormatter(count, 0)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function categoricalEmptyMessage(
  filterKey: string,
  tableName: string | undefined,
) {
  switch (filterKey) {
    case "name":
    case "traceName":
      return <span>No names found in this time range.</span>;
    case "sessionId":
      return (
        <span>
          Sessions group {tableName} together, which is useful for tracing
          multi-step workflows.{" "}
          <a
            href="https://langfuse.com/docs/observability/features/sessions"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline"
          >
            See docs
          </a>{" "}
          to learn how to add sessions to your {tableName}.
        </span>
      );
    case "tags":
      return (
        <span>
          Tags let you filter {tableName} according to custom categories (e.g.
          feature flags).{" "}
          <a
            href="https://langfuse.com/docs/observability/features/tags"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline"
          >
            See docs
          </a>{" "}
          to learn how to add tags to your {tableName}.
        </span>
      );
    default:
      return "No options found";
  }
}
