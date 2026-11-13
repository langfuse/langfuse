import { Fragment, useId, useRef, useState, type ReactNode } from "react";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Button as DsButton } from "@/src/components/design-system/Button/Button";
import { Input } from "@/src/components/design-system/Input/Input";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { Skeleton } from "@/src/components/ui/skeleton";
import { rankFacetOptions } from "../lib/facet-display";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";

export type CategoricalFilterSelectProps = {
  filterKey: string;
  loading?: boolean;
  options: string[];
  counts: Map<string, number>;
  showCounts?: boolean;
  displayByValue?: Map<string, string>;
  value: string[];
  onChange: (values: string[]) => void;
  onOnlyChange?: (value: string) => void;
  renderIcon?: (value: string) => ReactNode;
  renderOptionSuffix?: (value: string) => ReactNode;
  getOptionTitle?: (value: string, label: string) => string;
  operator?: "any of" | "all of" | "none of";
  onOperatorChange?: (operator: "any of" | "all of" | "none of") => void;
  tableName?: string;
};

// Values shown per facet before "Show more values" gates the rest.
const MAX_VISIBLE_OPTIONS = 12;
// Each "Show more values" click reveals this many additional values.
const SHOW_MORE_INCREMENT = 50;

// Shared checkbox selector. Search and pagination reset when its host closes.
export function CategoricalFilterSelect({
  filterKey,
  loading,
  options,
  counts,
  showCounts = true,
  displayByValue,
  value,
  onChange,
  onOnlyChange,
  renderIcon,
  renderOptionSuffix,
  getOptionTitle,
  operator,
  onOperatorChange,
  tableName = "data",
}: CategoricalFilterSelectProps) {
  const id = useId();
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
  const searchRef = useRef<HTMLInputElement>(null);
  const [focusedOptions, setFocusedOptions] = useState<string[] | null>(null);
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

  // Pin selected values for positive filters and unchecked values for exclusions.
  // The common visibility cap still bounds large applied selections.
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

  // Selection changes must not move or unmount the focused row. Keep the
  // current visible order while a row has focus, then resume normal pinning.
  const visibleOptions =
    focusedOptions ?? orderedOptions.slice(0, visibleCount);
  const canShowMore = orderedOptions.length > visibleCount;
  const canShowFewer = visibleCount > MAX_VISIBLE_OPTIONS;

  const renderOption = (option: string) => {
    const displayLabel = displayByValue?.get(option) ?? option;
    return (
      <FilterValueCheckbox
        key={option}
        id={`${id}-${filterKey}-${option}`}
        label={displayLabel}
        title={getOptionTitle?.(option, displayLabel)}
        icon={renderIcon?.(option)}
        suffix={renderOptionSuffix?.(option)}
        count={showCounts ? counts.get(option) || 0 : null}
        checked={value.includes(option)}
        onCheckedChange={(checked) => {
          const newValues = checked
            ? [...value, option]
            : value.filter((v: string) => v !== option);
          onChange(newValues);
        }}
        onLabelClick={onOnlyChange ? () => onOnlyChange(option) : undefined}
        onFocusChange={(focused) =>
          setFocusedOptions(focused ? visibleOptions : null)
        }
        totalSelected={value.length}
      />
    );
  };

  return (
    <div
      className="ph-no-capture px-3"
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          (event.key !== "ArrowDown" && event.key !== "ArrowUp") ||
          !(event.target instanceof HTMLElement)
        )
          return;

        const checkboxes = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            '[role="checkbox"]:not([disabled])',
          ),
        );
        if (event.target === searchRef.current) {
          if (event.key === "ArrowDown" && checkboxes.length > 0) {
            event.preventDefault();
            checkboxes[0].focus();
          }
          return;
        }

        const index = checkboxes.indexOf(event.target);
        if (index === -1) return;
        event.preventDefault();
        if (event.key === "ArrowUp" && index === 0 && searchRef.current) {
          searchRef.current.focus();
          return;
        }
        const nextIndex =
          event.key === "ArrowDown"
            ? Math.min(index + 1, checkboxes.length - 1)
            : Math.max(index - 1, 0);
        checkboxes[nextIndex]?.focus();
      }}
    >
      {/* Array columns support any-of, all-of, and exclusion matching. */}
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
              {/* An empty selection has nothing to exclude. */}
              <Tooltip
                label={
                  operator === undefined
                    ? "Nothing to exclude yet — uncheck a value to exclude it, or select values first."
                    : "Exclude the unchecked values"
                }
              >
                {({ getTriggerProps }) => (
                  <span {...getTriggerProps()} className="w-full min-w-0">
                    <Tabs.Trigger
                      value="none of"
                      disabled={operator === undefined}
                      label="None of"
                    />
                  </span>
                )}
              </Tooltip>
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
          {emptyFacetContent(filterKey, tableName)}
        </div>
      )}
      {!loading && visibleOptionValues.length > 0 && (
        <>
          {/* Search box for many options */}
          {hasMoreOptions && (
            <div className="mb-2">
              <div className="relative">
                <Input
                  ref={searchRef}
                  placeholder="Filter values"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Filter values"
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
              {visibleOptions.map((option, index) => (
                <Fragment key={option}>
                  {pinApplied &&
                    index > 0 &&
                    pinnedSet.has(visibleOptions[index - 1]) &&
                    !pinnedSet.has(option) && (
                      <div
                        className="border-border/60 mx-3 my-1 border-t"
                        aria-hidden
                      />
                    )}
                  {renderOption(option)}
                </Fragment>
              ))}
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

interface FilterValueCheckboxProps {
  id: string;
  label: string;
  title?: string;
  icon?: ReactNode;
  suffix?: ReactNode;
  count: number | null;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onLabelClick?: () => void; // For "only this" behavior
  onFocusChange: (focused: boolean) => void;
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
  onFocusChange,
  totalSelected,
  disabled = false,
}: FilterValueCheckboxProps) {
  // Show "All" when clicking would reverse selection (only one item selected)
  const labelText = checked && totalSelected === 1 ? "All" : "Only";

  // Display placeholder for empty strings to ensure clickable area
  const displayLabel = label === "" ? "(empty)" : label;
  const displayTitle = title ?? (label === "" ? "(empty)" : label);
  const labelContent = (
    <>
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
      {onLabelClick && !disabled && (
        <span className="text-muted-foreground hidden shrink-0 pl-1 text-xs whitespace-nowrap group-hover/label:block group-focus-visible/label:block">
          {labelText}
        </span>
      )}
      {count !== null && count > 0 ? (
        <span className="text-muted-foreground ml-auto w-7 shrink-0 pl-1 text-right text-xs">
          {compactNumberFormatter(count, 0)}
        </span>
      ) : null}
    </>
  );

  return (
    <div
      className={cn(
        "relative flex items-center",
        disabled && "cursor-not-allowed opacity-50",
      )}
      onFocus={() => onFocusChange(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          onFocusChange(false);
      }}
    >
      {/* One hover tint for the whole row, same inset as the header box above. */}
      <div className="hover:bg-accent flex min-h-6 min-w-0 flex-1 items-center rounded-md px-2 py-0.5 transition-colors">
        <label
          htmlFor={id}
          className={cn(
            "flex size-6 shrink-0 cursor-pointer items-center justify-center",
            disabled && "cursor-not-allowed",
          )}
        >
          <Checkbox
            id={id}
            aria-label={displayLabel}
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            size="sm"
          />
        </label>

        {onLabelClick ? (
          <button
            type="button"
            className="group/label focus-visible:ring-ring flex min-h-6 min-w-0 flex-1 cursor-pointer items-center self-stretch rounded-sm pr-1 pl-2 text-left focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed"
            disabled={disabled}
            aria-label={
              labelText === "All"
                ? "Select all values"
                : `Select only ${displayLabel}`
            }
            onClick={onLabelClick}
          >
            {labelContent}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center self-stretch pr-1 pl-2">
            {labelContent}
          </div>
        )}
      </div>
    </div>
  );
}

function emptyFacetContent(filterKey: string, tableName: string): ReactNode {
  if (filterKey === "sessionId")
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
  if (filterKey === "name")
    return <span>No {tableName} names found in the given time range.</span>;
  if (filterKey === "tags")
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
  return "No options found";
}
