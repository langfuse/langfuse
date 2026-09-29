/* eslint-disable no-nested-ternary */
import { useId, useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { MultiSelectInput } from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/src/components/ui/popover";
import { rankFacetOptions } from "@/src/features/filters/lib/facet-display";
import { isStringPresenceOperator } from "@/src/features/filters/lib/sidebar-filter-actions";
import { Plus, X } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type {
  KeyScoreLevels,
  KeyValueFilterEntry,
  NumericKeyValueFilterEntry,
  BooleanKeyValueFilterEntry,
  StringKeyValueFilterEntry,
} from "@/src/features/filters/hooks/useSidebarFilterState";

type KeyValueFilterBuilderProps =
  | {
      mode: "categorical";
      keyOptions?: string[];
      keyLevels?: KeyScoreLevels;
      availableValues: Record<string, string[]>;
      activeFilters: KeyValueFilterEntry[];
      onChange: (filters: KeyValueFilterEntry[]) => void;
      keyPlaceholder?: string;
    }
  | {
      mode: "numeric";
      keyOptions?: string[];
      keyLevels?: KeyScoreLevels;
      activeFilters: NumericKeyValueFilterEntry[];
      onChange: (filters: NumericKeyValueFilterEntry[]) => void;
      keyPlaceholder?: string;
    }
  | {
      mode: "boolean";
      keyOptions?: string[];
      keyLevels?: KeyScoreLevels;
      activeFilters: BooleanKeyValueFilterEntry[];
      onChange: (filters: BooleanKeyValueFilterEntry[]) => void;
      keyPlaceholder?: string;
    }
  | {
      mode: "string";
      keyOptions?: string[];
      keyLevels?: KeyScoreLevels;
      /** Offered key → display-only type hint, shown beside the key option. */
      keyDetails?: Record<string, string>;
      /** Offered key → its observed values, suggested under the value input. */
      valueOptions?: Record<string, string[]>;
      activeFilters: StringKeyValueFilterEntry[];
      onChange: (filters: StringKeyValueFilterEntry[]) => void;
      keyPlaceholder?: string;
    };

type KeyedFilterEntry =
  | KeyValueFilterEntry
  | NumericKeyValueFilterEntry
  | BooleanKeyValueFilterEntry
  | StringKeyValueFilterEntry;

// Map operators to human-readable labels
const NUMERIC_OPERATOR_LABELS = {
  "=": "equals",
  ">": "greater than",
  "<": "less than",
  ">=": "greater than or equals",
  "<=": "less than or equals",
} as const;

const STRING_OPERATOR_LABELS = {
  "=": "equals",
  contains: "contains",
  "does not contain": "does not contain",
  "is set": "is set",
  "is not set": "is not set",
} as const;

type StringOperator = keyof typeof STRING_OPERATOR_LABELS;

const BOOLEAN_OPERATOR_LABELS = {
  "=": "equals",
  "<>": "does not equal",
} as const;

const CATEGORICAL_OPERATOR_OPTIONS = [
  { value: "any of", label: "any of" },
  { value: "none of", label: "none of" },
];

const NUMERIC_OPERATOR_OPTIONS = Object.entries(NUMERIC_OPERATOR_LABELS).map(
  ([value, label]) => ({ value, label }),
);
const BOOLEAN_OPERATOR_OPTIONS = Object.entries(BOOLEAN_OPERATOR_LABELS).map(
  ([value, label]) => ({ value, label }),
);
const STRING_OPERATOR_OPTIONS = Object.entries(STRING_OPERATOR_LABELS).map(
  ([value, label]) => ({ value, label }),
);
const BOOLEAN_VALUE_OPTIONS = [
  { value: "true", label: "true" },
  { value: "false", label: "false" },
];

// Enough to recognise what is available without turning the facet into a
// scroll surface.
const MAX_SUGGESTIONS = 10;

/**
 * Free-text input that offers observed values underneath — the sidebar half of
 * the unified metadata suggestions (LFE-11030). Suggestions, not an
 * enumeration: metadata keys and values are unbounded and the observed map only
 * covers rows already loaded, so typing always wins and a picked row merely
 * fills the input. Ranked with the search bar's own `filterRank` so both
 * surfaces order identically.
 */
function SuggestingInput({
  value,
  onChange,
  suggestions,
  details,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  /** Suggestion → display-only hint shown at the row's right edge. */
  details?: Record<string, string>;
  placeholder: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const ranked = useMemo(
    // Drop an exact match: re-offering what is already typed covers the field
    // with a row that changes nothing when picked.
    () =>
      rankFacetOptions(
        suggestions.filter((s) => s !== value),
        value,
      ).slice(0, MAX_SUGGESTIONS),
    [suggestions, value],
  );
  const open = focused && !dismissed && ranked.length > 0;
  const active = open && activeIndex >= 0 ? ranked[activeIndex] : undefined;

  const accept = (suggestion: string) => {
    onChange(suggestion);
    setDismissed(true);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && open) {
      // Stop here: the sidebar may live in a Sheet that also closes on Escape.
      event.stopPropagation();
      setDismissed(true);
      // Same reset as onBlur — a highlight kept across a dismissal would let a
      // later ArrowDown-then-Enter accept it without the user re-picking.
      setActiveIndex(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setDismissed(false);
        return;
      }
      // Cycle through [-1 (nothing active), 0 … n-1] in both directions.
      const step = event.key === "ArrowDown" ? 1 : -1;
      const slots = ranked.length + 1;
      setActiveIndex((current) => ((current + 1 + step + slots) % slots) - 1);
      return;
    }
    if (event.key === "Enter" && active !== undefined) {
      event.preventDefault();
      accept(active);
    }
  };

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        <Input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setDismissed(false);
            setActiveIndex(-1);
          }}
          onFocus={() => setFocused(true)}
          // Blur resets the whole interaction, not just focus: a stale
          // `activeIndex` would let the next Enter accept a highlight the user
          // never made, and a stale `dismissed` would survive into whichever row
          // React reuses this index-keyed instance for after a row is deleted.
          onBlur={() => {
            setFocused(false);
            setDismissed(false);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            active !== undefined ? `${listId}-${activeIndex}` : undefined
          }
        />
      </PopoverAnchor>
      <PopoverContent
        // Suggestions read as an extension of the input, so they match its
        // width instead of the popover default's 18rem floor.
        className="w-(--radix-popover-trigger-width) min-w-0 p-1"
        align="start"
        // Focus stays in the input — this is a suggestion list, not a dialog.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div id={listId} role="listbox">
          {ranked.map((suggestion, i) => (
            <button
              key={suggestion}
              id={`${listId}-${i}`}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm",
                i === activeIndex ? "bg-accent" : "hover:bg-accent",
              )}
              title={suggestion}
              // mousedown, not click: the input must not blur before we apply.
              onMouseDown={(e) => {
                e.preventDefault();
                accept(suggestion);
              }}
            >
              <span className="min-w-0 flex-1 truncate" title={suggestion}>
                {suggestion}
              </span>
              {details?.[suggestion] && (
                <span className="text-muted-foreground shrink-0 text-xs">
                  {details[suggestion]}
                </span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function KeyValueFilterBuilder(props: KeyValueFilterBuilderProps) {
  const {
    mode,
    keyOptions,
    keyLevels,
    activeFilters,
    keyPlaceholder = "Key",
  } = props;
  const availableValues = mode === "categorical" ? props.availableValues : {};
  const keyDetails = mode === "string" ? props.keyDetails : undefined;
  const valueOptions = mode === "string" ? props.valueOptions : undefined;

  // Applied rows belong to the parent; only incomplete edits stay local.
  const [draftFilters, setDraftFilters] = useState<
    { index: number; filter: KeyedFilterEntry }[]
  >([]);
  const localFilters: KeyedFilterEntry[] = [...activeFilters];
  for (const draft of draftFilters) {
    localFilters.splice(draft.index, 0, draft.filter);
  }

  const isComplete = (filter: KeyedFilterEntry) =>
    !!filter.key &&
    // Presence rows (`is set` / `is not set`) need no value to be applied.
    (isStringPresenceOperator(filter.operator)
      ? true
      : Array.isArray(filter.value)
        ? filter.value.length > 0
        : typeof filter.value === "string"
          ? filter.value.trim() !== ""
          : true);

  const updateFilters = (filters: KeyedFilterEntry[]) => {
    setDraftFilters(
      filters.flatMap((filter, index) =>
        isComplete(filter) ? [] : [{ index, filter }],
      ),
    );
    const completeFilters = filters.filter(isComplete);
    if (props.mode === "categorical") {
      props.onChange(completeFilters as KeyValueFilterEntry[]);
    } else if (props.mode === "numeric") {
      props.onChange(completeFilters as NumericKeyValueFilterEntry[]);
    } else if (props.mode === "boolean") {
      props.onChange(completeFilters as BooleanKeyValueFilterEntry[]);
    } else {
      props.onChange(completeFilters as StringKeyValueFilterEntry[]);
    }
  };

  const handleFilterChange = (
    index: number,
    updates:
      | Partial<KeyValueFilterEntry>
      | Partial<NumericKeyValueFilterEntry>
      | Partial<BooleanKeyValueFilterEntry>
      | Partial<StringKeyValueFilterEntry>,
  ) => {
    const filters = [...localFilters];
    filters[index] = { ...filters[index], ...updates } as KeyedFilterEntry;
    updateFilters(filters);
  };

  const handleAddFilter = () => {
    setDraftFilters([
      ...draftFilters,
      {
        index: localFilters.length,
        filter:
          mode === "categorical"
            ? { key: "", operator: "any of", value: [] }
            : { key: "", operator: "=", value: "" },
      },
    ]);
  };

  const handleRemoveFilter = (index: number) => {
    updateFilters(localFilters.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-1">
      {/* Filter rows */}
      {localFilters.map((filter, index) => {
        const availableValuesForKey = filter.key
          ? (availableValues[filter.key] ?? [])
          : [];
        const mergedKeyOptions = Array.from(
          new Set(
            [
              ...(keyOptions ?? []),
              ...localFilters.map((item) => item.key),
            ].filter((value) => value.length > 0),
          ),
        );
        // Free-text keys with suggestions where the key space is open-ended
        // (metadata); a pick-only combobox where the backend enumerates it
        // (score names) — offering an observed metadata key must never take
        // away typing one the store has not seen (LFE-11030).
        const suggestKeys = mode === "string";
        // Gate on the OFFERED keys, never on mergedKeyOptions: that folds in the
        // live-typed row keys, so a facet with nothing enumerated would flip
        // from free text to pick-only after the first keystroke and trap the
        // user at one character.
        const hasKeyOptions = !suggestKeys && (keyOptions?.length ?? 0) > 0;

        return (
          <div
            key={index}
            className="flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0"
          >
            {/* Key input and delete button row */}
            <div className="flex items-center gap-2">
              {hasKeyOptions ? (
                <div className="min-w-0 flex-1">
                  <SelectInput
                    value={filter.key}
                    placeholder={keyPlaceholder}
                    search={{ placeholder: "Search keys..." }}
                    emptyMessage="No keys found."
                    options={mergedKeyOptions.map((option) => ({
                      value: option,
                      label: option,
                      badges: keyLevels?.[option]?.map((level) => ({
                        text: level === "trace" ? "Trace" : "Observation",
                        title: `${level === "trace" ? "Trace" : "Observation"}-level score`,
                        color:
                          level === "trace"
                            ? ("violet" as const)
                            : ("blue" as const),
                      })),
                    }))}
                    onValueChange={(key) => handleFilterChange(index, { key })}
                  />
                </div>
              ) : (
                // Free-form key, with observed keys offered as suggestions.
                // Only the key changes — the row's value is preserved.
                <div className="min-w-0 flex-1">
                  <SuggestingInput
                    value={filter.key}
                    onChange={(key) => handleFilterChange(index, { key })}
                    suggestions={suggestKeys ? (keyOptions ?? []) : []}
                    details={keyDetails}
                    placeholder={keyPlaceholder}
                  />
                </div>
              )}

              {/* Delete button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveFilter(index)}
                className="h-8 w-8 p-0"
              >
                <X />
              </Button>
            </div>

            {mode === "categorical" ? (
              <>
                {/* Operator select */}
                <SelectInput
                  value={filter.operator}
                  options={CATEGORICAL_OPERATOR_OPTIONS}
                  placeholder="Operator"
                  onValueChange={(value) =>
                    handleFilterChange(index, {
                      operator: value as "any of" | "none of",
                    })
                  }
                />

                {/* Values multi-select */}
                <MultiSelectInput
                  placeholder="Select"
                  selectedLabel={`${(filter.value as string[]).length} selected`}
                  searchPlaceholder="Values"
                  emptyMessage="No results found."
                  selectAllLabel="Select All"
                  options={Array.from(
                    new Set([
                      ...availableValuesForKey,
                      ...(filter.value as string[]),
                    ]),
                  )
                    .filter((value) => value.length > 0)
                    .map((value) => ({ value, label: value }))}
                  value={filter.value as string[]}
                  onValueChange={(values) =>
                    handleFilterChange(index, { value: values })
                  }
                  disabled={!filter.key}
                />
              </>
            ) : mode === "numeric" ? (
              <>
                {/* Numeric operator select */}
                <SelectInput
                  value={filter.operator}
                  options={NUMERIC_OPERATOR_OPTIONS}
                  placeholder="Operator"
                  onValueChange={(value) =>
                    handleFilterChange(index, {
                      operator: value as "=" | ">" | "<" | ">=" | "<=",
                    })
                  }
                />

                {/* Numeric value input */}
                <Input
                  type="number"
                  placeholder="Value"
                  value={(filter as NumericKeyValueFilterEntry).value}
                  onChange={(e) =>
                    handleFilterChange(index, {
                      value:
                        e.target.value === "" ? "" : parseFloat(e.target.value),
                    })
                  }
                  disabled={!filter.key}
                />
              </>
            ) : mode === "boolean" ? (
              <>
                <SelectInput
                  value={filter.operator}
                  options={BOOLEAN_OPERATOR_OPTIONS}
                  placeholder="Operator"
                  onValueChange={(value) =>
                    handleFilterChange(index, {
                      operator: value as "=" | "<>",
                    })
                  }
                />

                <SelectInput
                  value={
                    typeof filter.value === "boolean"
                      ? String(filter.value)
                      : ""
                  }
                  options={BOOLEAN_VALUE_OPTIONS}
                  placeholder="Value"
                  onValueChange={(value) =>
                    handleFilterChange(index, {
                      value: value === "true",
                    })
                  }
                  disabled={!filter.key}
                />
              </>
            ) : (
              <>
                {/* String operator select */}
                <SelectInput
                  value={filter.operator}
                  options={STRING_OPERATOR_OPTIONS}
                  placeholder="Operator"
                  onValueChange={(value) => {
                    const operator = value as StringOperator;
                    handleFilterChange(index, {
                      operator,
                      // Presence operators carry no value; clear it so no
                      // stale string is persisted alongside `is set`.
                      ...(isStringPresenceOperator(operator)
                        ? { value: "" }
                        : {}),
                    });
                  }}
                />

                {/* String value input, hidden for value-less presence operators */}
                {isStringPresenceOperator(filter.operator) ? null : (
                  <SuggestingInput
                    value={filter.value as string}
                    onChange={(value) => handleFilterChange(index, { value })}
                    suggestions={
                      filter.key ? (valueOptions?.[filter.key] ?? []) : []
                    }
                    placeholder="Value"
                    disabled={!filter.key}
                  />
                )}
              </>
            )}
          </div>
        );
      })}

      {/* Add filter button */}
      <Button
        onClick={handleAddFilter}
        size="sm"
        variant="outline"
        className="w-full"
      >
        <Plus className="mr-2" />
        Add filter
      </Button>
    </div>
  );
}
