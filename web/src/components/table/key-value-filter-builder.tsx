import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import { Plus, X } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type {
  KeyValueFilterEntry,
  NumericKeyValueFilterEntry,
  StringKeyValueFilterEntry,
} from "@/src/features/filters/hooks/useSidebarFilterState";

type KeyValueFilterBuilderProps =
  | {
      mode: "categorical";
      keyOptions?: string[];
      availableValues: Record<string, string[]>;
      activeFilters: KeyValueFilterEntry[];
      onChange: (filters: KeyValueFilterEntry[]) => void;
      keyPlaceholder?: string;
    }
  | {
      mode: "numeric";
      keyOptions?: string[];
      activeFilters: NumericKeyValueFilterEntry[];
      onChange: (filters: NumericKeyValueFilterEntry[]) => void;
      keyPlaceholder?: string;
    }
  | {
      mode: "string";
      keyOptions?: string[];
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

export function KeyValueFilterBuilder(props: KeyValueFilterBuilderProps) {
  const {
    mode,
    keyOptions,
    activeFilters,
    onChange,
    keyPlaceholder = "Key",
  } = props;
  const availableValues = mode === "categorical" ? props.availableValues : {};

  // Local UI state for filter rows (includes incomplete filters)
  // Initialize once from activeFilters but don't sync on every change
  // This allows incomplete filter rows to persist in the UI while being edited
  const [localFilters, setLocalFilters] = useState<
    | KeyValueFilterEntry[]
    | NumericKeyValueFilterEntry[]
    | StringKeyValueFilterEntry[]
  >(() => (activeFilters.length > 0 ? activeFilters : []));

  // Sync when parent clears all filters externally
  const prevActiveFiltersLen = useRef(activeFilters.length);
  useEffect(() => {
    if (activeFilters.length === 0 && prevActiveFiltersLen.current > 0) {
      setLocalFilters([]);
    }
    prevActiveFiltersLen.current = activeFilters.length;
  }, [activeFilters.length]);

  const handleFilterChange = (
    index: number,
    updates:
      | Partial<KeyValueFilterEntry>
      | Partial<NumericKeyValueFilterEntry>
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

        return (
          <div
            key={index}
            className="flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0"
          >
            {/* Key input and delete button row */}
            <div className="flex items-center gap-2">
              <KeyAutocompleteInput
                value={filter.key}
                placeholder={keyPlaceholder}
                keyOptions={keyOptions}
                onChange={(key) => handleFilterChange(index, { key })}
              />

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
                  value={filter.value}
                  onChange={(e) =>
                    handleFilterChange(index, {
                      value:
                        e.target.value === "" ? "" : parseFloat(e.target.value),
                    })
                  }
                  disabled={!filter.key}
                />
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

                {/* String value input */}
                <Input
                  type="text"
                  placeholder="Value"
                  value={filter.value as string}
                  onChange={(e) =>
                    handleFilterChange(index, {
                      value: e.target.value,
                    })
                  }
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

function KeyAutocompleteInput({
  value,
  placeholder,
  keyOptions,
  onChange,
}: {
  value: string;
  placeholder: string;
  keyOptions?: string[];
  onChange: (key: string) => void;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from parent when value changes externally (e.g. reset)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const debouncedOnChange = useCallback(
    (v: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onChange(v), 300);
    },
    [onChange],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocalValue(v);
    setHighlightIndex(-1);
    debouncedOnChange(v);
  };

  // Hierarchical segment navigation:
  // "abc." → show unique next segments (e.g. "def", "xyz") from keys starting with "abc."
  // "abc.d" → filter next segments to those containing "d"
  // No dot → show unique first segments matching input
  const lastDotIndex = localValue.lastIndexOf(".");
  const dotPrefix =
    lastDotIndex !== -1 ? localValue.slice(0, lastDotIndex + 1) : "";
  const currentSegmentInput = dotPrefix
    ? localValue.slice(dotPrefix.length)
    : localValue;

  // Keys matching the current dot prefix
  const prefixMatchingKeys = dotPrefix
    ? (keyOptions ?? []).filter((k) =>
        k.toLowerCase().startsWith(dotPrefix.toLowerCase()),
      )
    : (keyOptions ?? []);

  // Extract unique next segments from matching keys
  const nextSegmentsSet = new Set<string>();
  for (const k of prefixMatchingKeys) {
    const suffix = dotPrefix ? k.slice(dotPrefix.length) : k;
    const nextDot = suffix.indexOf(".");
    const segment = nextDot === -1 ? suffix : suffix.slice(0, nextDot);
    if (segment) nextSegmentsSet.add(segment);
  }

  // Filter by what user typed for current segment
  const suggestions = [...nextSegmentsSet]
    .filter((s) =>
      currentSegmentInput
        ? s.toLowerCase().includes(currentSegmentInput.toLowerCase())
        : true,
    )
    .slice(0, 20);

  const handleSelect = (segment: string) => {
    const fullKey = dotPrefix + segment;
    const childPrefix = fullKey + ".";
    const hasChildren = (keyOptions ?? []).some((k) =>
      k.toLowerCase().startsWith(childPrefix.toLowerCase()),
    );

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (hasChildren) {
      // Drill down: append dot to continue navigating deeper
      setLocalValue(childPrefix);
      onChange(childPrefix);
    } else {
      // Leaf key: set final value and close
      setLocalValue(fullKey);
      onChange(fullKey);
      setIsFocused(false);
    }
  };

  // Don't show dropdown if only suggestion is exactly what user already typed
  const showSuggestions =
    isFocused &&
    suggestions.length > 0 &&
    !(suggestions.length === 1 && suggestions[0] === currentSegmentInput);

  // Measure prefix width to offset the dropdown when completing after a dot
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  return (
    <div className="relative flex-1">
      {/* Hidden span to measure prefix text width */}
      {dotPrefix && (
        <span
          ref={measureRef}
          className="pointer-events-none invisible absolute whitespace-pre text-sm"
          aria-hidden
        >
          {dotPrefix}
        </span>
      )}
      <Input
        ref={inputRef}
        placeholder={placeholder}
        value={localValue}
        onChange={handleInputChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 150)}
        onKeyDown={(e) => {
          if (!showSuggestions) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightIndex((i) => (i < suggestions.length - 1 ? i + 1 : 0));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightIndex((i) => (i > 0 ? i - 1 : suggestions.length - 1));
          } else if (e.key === "Enter" && highlightIndex >= 0) {
            e.preventDefault();
            handleSelect(suggestions[highlightIndex]);
          }
        }}
        className="flex-1"
      />
      {showSuggestions && (
        <div
          className="absolute z-50 mt-1 w-fit max-w-full overflow-auto rounded-md border bg-popover p-0.5 shadow-md"
          style={{
            maxHeight: "6rem",
            left: dotPrefix
              ? `${(measureRef.current?.offsetWidth ?? 0) + 8}px`
              : undefined,
          }}
        >
          {suggestions.map((segment, i) => (
            <div
              key={segment}
              className={cn(
                "cursor-pointer truncate rounded-sm px-2 py-0.5 text-xs hover:bg-accent hover:text-accent-foreground",
                (i === highlightIndex || dotPrefix + segment === localValue) &&
                  "bg-accent text-accent-foreground",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(segment);
              }}
            >
              {segment}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
