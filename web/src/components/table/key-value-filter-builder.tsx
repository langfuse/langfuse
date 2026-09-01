import { useId, useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  InputCommand,
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
  InputCommandList,
} from "@/src/components/ui/input-command";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import { rankFacetOptions } from "@/src/features/filters/lib/facet-display";
import { Plus, X, Check, ChevronDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { ScoreTag } from "@/src/components/score-tag";
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
} as const;

const BOOLEAN_OPERATOR_LABELS = {
  "=": "equals",
  "<>": "does not equal",
} as const;

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
    onChange,
    keyPlaceholder = "Key",
  } = props;
  const availableValues = mode === "categorical" ? props.availableValues : {};
  const keyDetails = mode === "string" ? props.keyDetails : undefined;
  const valueOptions = mode === "string" ? props.valueOptions : undefined;

  // Track which popover is open (by index)
  const [openPopoverIndex, setOpenPopoverIndex] = useState<number | null>(null);

  // Local UI state for filter rows (includes incomplete filters)
  // Initialize once from activeFilters but don't sync on every change
  // This allows incomplete filter rows to persist in the UI while being edited
  const [localFilters, setLocalFilters] = useState<
    | KeyValueFilterEntry[]
    | NumericKeyValueFilterEntry[]
    | BooleanKeyValueFilterEntry[]
    | StringKeyValueFilterEntry[]
  >(() => (activeFilters.length > 0 ? activeFilters : []));

  const handleFilterChange = (
    index: number,
    updates:
      | Partial<KeyValueFilterEntry>
      | Partial<NumericKeyValueFilterEntry>
      | Partial<BooleanKeyValueFilterEntry>
      | Partial<StringKeyValueFilterEntry>,
  ) => {
    // TypeScript can't narrow the union array type automatically, so we narrow explicitly based on mode
    if (mode === "categorical") {
      const filters = localFilters as KeyValueFilterEntry[];
      const newFilters = [...filters];
      newFilters[index] = {
        ...newFilters[index],
        ...updates,
      } as KeyValueFilterEntry;
      setLocalFilters(newFilters);
      (onChange as (filters: KeyValueFilterEntry[]) => void)(newFilters);
    } else if (mode === "numeric") {
      const filters = localFilters as NumericKeyValueFilterEntry[];
      const newFilters = [...filters];
      newFilters[index] = {
        ...newFilters[index],
        ...updates,
      } as NumericKeyValueFilterEntry;
      setLocalFilters(newFilters);
      (onChange as (filters: NumericKeyValueFilterEntry[]) => void)(newFilters);
    } else if (mode === "boolean") {
      const filters = localFilters as BooleanKeyValueFilterEntry[];
      const newFilters = [...filters];
      newFilters[index] = {
        ...newFilters[index],
        ...updates,
      } as BooleanKeyValueFilterEntry;
      setLocalFilters(newFilters);
      (onChange as (filters: BooleanKeyValueFilterEntry[]) => void)(newFilters);
    } else {
      const filters = localFilters as StringKeyValueFilterEntry[];
      const newFilters = [...filters];
      newFilters[index] = {
        ...newFilters[index],
        ...updates,
      } as StringKeyValueFilterEntry;
      setLocalFilters(newFilters);
      (onChange as (filters: StringKeyValueFilterEntry[]) => void)(newFilters);
    }
  };

  const handleAddFilter = () => {
    if (mode === "categorical") {
      const newFilter: KeyValueFilterEntry = {
        key: "",
        operator: "any of" as const,
        value: [],
      };
      const filters = localFilters as KeyValueFilterEntry[];
      const newFilters = [...filters, newFilter];
      setLocalFilters(newFilters);
    } else if (mode === "numeric") {
      const newFilter: NumericKeyValueFilterEntry = {
        key: "",
        operator: "=" as const,
        value: "",
      };
      const filters = localFilters as NumericKeyValueFilterEntry[];
      const newFilters = [...filters, newFilter];
      setLocalFilters(newFilters);
    } else if (mode === "boolean") {
      const newFilter: BooleanKeyValueFilterEntry = {
        key: "",
        operator: "=" as const,
        value: "",
      };
      const filters = localFilters as BooleanKeyValueFilterEntry[];
      const newFilters = [...filters, newFilter];
      setLocalFilters(newFilters);
    } else {
      const newFilter: StringKeyValueFilterEntry = {
        key: "",
        operator: "=" as const,
        value: "",
      };
      const filters = localFilters as StringKeyValueFilterEntry[];
      const newFilters = [...filters, newFilter];
      setLocalFilters(newFilters);
    }
  };

  const handleRemoveFilter = (index: number) => {
    if (mode === "categorical") {
      const filters = localFilters as KeyValueFilterEntry[];
      const newFilters = filters.filter((_, i) => i !== index);
      setLocalFilters(newFilters);
      (onChange as (filters: KeyValueFilterEntry[]) => void)(newFilters);
    } else if (mode === "numeric") {
      const filters = localFilters as NumericKeyValueFilterEntry[];
      const newFilters = filters.filter((_, i) => i !== index);
      setLocalFilters(newFilters);
      (onChange as (filters: NumericKeyValueFilterEntry[]) => void)(newFilters);
    } else if (mode === "boolean") {
      const filters = localFilters as BooleanKeyValueFilterEntry[];
      const newFilters = filters.filter((_, i) => i !== index);
      setLocalFilters(newFilters);
      (onChange as (filters: BooleanKeyValueFilterEntry[]) => void)(newFilters);
    } else {
      const filters = localFilters as StringKeyValueFilterEntry[];
      const newFilters = filters.filter((_, i) => i !== index);
      setLocalFilters(newFilters);
      (onChange as (filters: StringKeyValueFilterEntry[]) => void)(newFilters);
    }
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
                // Combobox for known keys
                <Popover
                  open={openPopoverIndex === index}
                  onOpenChange={(open) =>
                    setOpenPopoverIndex(open ? index : null)
                  }
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="min-w-0 flex-1 justify-between overflow-hidden text-left font-normal"
                    >
                      {/* Selected name renders plain — level tags show only in
                          the option rows below (design call: a selected filter
                          needs no level tag, and long names must truncate). */}
                      <span
                        className={cn(
                          "min-w-0 truncate",
                          !filter.key && "text-muted-foreground",
                        )}
                        title={filter.key || keyPlaceholder}
                      >
                        {filter.key || keyPlaceholder}
                      </span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0" align="start">
                    <InputCommand>
                      <InputCommandInput
                        placeholder="Search keys..."
                        variant="bottom"
                      />
                      <InputCommandList>
                        <InputCommandEmpty>No keys found.</InputCommandEmpty>
                        <InputCommandGroup>
                          {mergedKeyOptions.map((option) => (
                            <InputCommandItem
                              key={option}
                              value={option}
                              onSelect={(value) => {
                                // Only update the key, preserve the existing value
                                handleFilterChange(index, {
                                  key: value,
                                });
                                setOpenPopoverIndex(null); // Close after selection
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  option === filter.key
                                    ? "visible"
                                    : "invisible",
                                )}
                              />
                              <span
                                className="min-w-0 flex-1 truncate"
                                title={option}
                              >
                                {option}
                              </span>
                              {keyLevels?.[option]?.map((level) => (
                                <span key={level} className="ml-1.5">
                                  <ScoreTag level={level} />
                                </span>
                              ))}
                            </InputCommandItem>
                          ))}
                        </InputCommandGroup>
                      </InputCommandList>
                    </InputCommand>
                  </PopoverContent>
                </Popover>
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
                <X className="h-4 w-4" />
              </Button>
            </div>

            {mode === "categorical" ? (
              <>
                {/* Operator select */}
                <Select
                  value={filter.operator}
                  onValueChange={(value) =>
                    handleFilterChange(index, {
                      operator: value as "any of" | "none of",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any of">any of</SelectItem>
                    <SelectItem value="none of">none of</SelectItem>
                  </SelectContent>
                </Select>

                {/* Values multi-select */}
                <MultiSelect
                  title="Values"
                  options={availableValuesForKey.map((v) => ({ value: v }))}
                  values={filter.value as string[]}
                  onValueChange={(values) =>
                    handleFilterChange(index, { value: values })
                  }
                  disabled={!filter.key}
                />
              </>
            ) : mode === "numeric" ? (
              <>
                {/* Numeric operator select */}
                <Select
                  value={filter.operator}
                  onValueChange={(value) =>
                    handleFilterChange(index, {
                      operator: value as "=" | ">" | "<" | ">=" | "<=",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(NUMERIC_OPERATOR_LABELS).map(
                      ([op, label]) => (
                        <SelectItem key={op} value={op}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>

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
                <Select
                  value={filter.operator}
                  onValueChange={(value) =>
                    handleFilterChange(index, {
                      operator: value as "=" | "<>",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(BOOLEAN_OPERATOR_LABELS).map(
                      ([op, label]) => (
                        <SelectItem key={op} value={op}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>

                <Select
                  value={
                    typeof filter.value === "boolean"
                      ? String(filter.value)
                      : undefined
                  }
                  onValueChange={(value) =>
                    handleFilterChange(index, {
                      value: value === "true",
                    })
                  }
                  disabled={!filter.key}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Value" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">true</SelectItem>
                    <SelectItem value="false">false</SelectItem>
                  </SelectContent>
                </Select>
              </>
            ) : (
              <>
                {/* String operator select */}
                <Select
                  value={filter.operator}
                  onValueChange={(value) =>
                    handleFilterChange(index, {
                      operator: value as "=" | "contains" | "does not contain",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STRING_OPERATOR_LABELS).map(
                      ([op, label]) => (
                        <SelectItem key={op} value={op}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>

                {/* String value input, with observed-value suggestions */}
                <SuggestingInput
                  value={filter.value as string}
                  onChange={(value) => handleFilterChange(index, { value })}
                  suggestions={
                    filter.key ? (valueOptions?.[filter.key] ?? []) : []
                  }
                  placeholder="Value"
                  disabled={!filter.key}
                />
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
        <Plus className="mr-2 h-4 w-4" />
        Add filter
      </Button>
    </div>
  );
}
