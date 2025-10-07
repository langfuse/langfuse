import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import useLocalStorage from "@/src/components/useLocalStorage";
import { cn } from "@/src/utils/tailwind";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { Accordion } from "@/src/components/ui/accordion";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { Slider } from "@/src/components/ui/slider";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { X as IconX, Search, WandSparkles } from "lucide-react";
import type {
  UIFilter,
  KeyValueFilterEntry,
  NumericKeyValueFilterEntry,
  StringKeyValueFilterEntry,
} from "@/src/features/filters/hooks/useSidebarFilterState";
import { KeyValueFilterBuilder } from "@/src/components/table/key-value-filter-builder";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { DataTableAIFilters } from "@/src/components/table/data-table-ai-filters";
import { type FilterState } from "@langfuse/shared";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

interface ControlsContextType {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const ControlsContext = createContext<ControlsContextType | null>(null);

export function DataTableControlsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useLocalStorage("data-table-controls", true);

  return (
    <ControlsContext.Provider value={{ open, setOpen }}>
      <div
        // access the data-expanded state with tailwind via `group-data-[expanded=true]/controls`
        className="group/controls contents"
        data-expanded={open}
      >
        {children}
      </div>
    </ControlsContext.Provider>
  );
}

export function useDataTableControls() {
  const context = useContext(ControlsContext);

  if (!context) {
    // Return default values when not in a provider (e.g., tables without the new sidebar)
    return { open: false, setOpen: () => {} };
  }

  return context as ControlsContextType;
}

export interface QueryFilter {
  filters: UIFilter[];
  expanded: string[];
  onExpandedChange: (value: string[]) => void;
  clearAll: () => void;
  isFiltered: boolean;
  setFilterState: (filters: FilterState) => void;
}

interface DataTableControlsProps {
  queryFilter: QueryFilter;
  filterWithAI?: boolean;
}

export function DataTableControls({
  queryFilter,
  filterWithAI,
}: DataTableControlsProps) {
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const [aiPopoverOpen, setAiPopoverOpen] = useState(false);

  const handleFiltersGenerated = useCallback(
    (filters: FilterState) => {
      // Apply filters
      queryFilter.setFilterState(filters);

      // Extract unique column names from filters
      const columnsToExpand = [...new Set(filters.map((f) => f.column))];

      // Get current expanded state and merge with new columns
      const currentExpanded = queryFilter.expanded;
      const newExpanded = Array.from(
        new Set([...currentExpanded, ...columnsToExpand]),
      );
      queryFilter.onExpandedChange(newExpanded);

      // Close popover
      setAiPopoverOpen(false);
    },
    [queryFilter],
  );

  return (
    <div
      className={cn(
        "h-full w-full border-r border-t bg-background sm:block sm:min-w-52 sm:max-w-52 md:min-w-64 md:max-w-64",
        "group-data-[expanded=false]/controls:hidden",
      )}
    >
      <div className="flex h-full flex-col overflow-auto">
        <div className="mb-2 flex h-10 shrink-0 items-center justify-between border-b px-3">
          <span className="text-sm font-medium">Filters</span>
          {filterWithAI && isLangfuseCloud && (
            <Popover open={aiPopoverOpen} onOpenChange={setAiPopoverOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <WandSparkles className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Filter with AI</TooltipContent>
              </Tooltip>
              <PopoverContent align="center" className="w-[400px]">
                <DataTableAIFilters
                  onFiltersGenerated={handleFiltersGenerated}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
        <Accordion
          type="multiple"
          className="w-full"
          value={queryFilter.expanded}
          onValueChange={queryFilter.onExpandedChange}
        >
          {queryFilter.filters.map((filter) => {
            if (filter.type === "categorical") {
              return (
                <CategoricalFacet
                  key={filter.column}
                  filterKey={filter.column}
                  filterKeyShort={filter.shortKey}
                  label={filter.label}
                  expanded={filter.expanded}
                  options={filter.options}
                  counts={filter.counts}
                  loading={filter.loading}
                  value={filter.value}
                  onChange={filter.onChange}
                  onOnlyChange={filter.onOnlyChange}
                  isActive={filter.isActive}
                  onReset={filter.onReset}
                />
              );
            }

            if (filter.type === "numeric") {
              return (
                <NumericFacet
                  key={filter.column}
                  filterKey={filter.column}
                  filterKeyShort={filter.shortKey}
                  label={filter.label}
                  expanded={filter.expanded}
                  loading={filter.loading}
                  min={filter.min}
                  max={filter.max}
                  value={filter.value}
                  onChange={filter.onChange}
                  unit={filter.unit}
                  isActive={filter.isActive}
                  onReset={filter.onReset}
                />
              );
            }

            if (filter.type === "string") {
              return (
                <StringFacet
                  key={filter.column}
                  filterKey={filter.column}
                  filterKeyShort={filter.shortKey}
                  label={filter.label}
                  expanded={filter.expanded}
                  loading={filter.loading}
                  value={filter.value}
                  onChange={filter.onChange}
                  isActive={filter.isActive}
                  onReset={filter.onReset}
                />
              );
            }

            if (filter.type === "keyValue") {
              return (
                <KeyValueFacet
                  key={filter.column}
                  filterKey={filter.column}
                  filterKeyShort={filter.shortKey}
                  label={filter.label}
                  expanded={filter.expanded}
                  loading={filter.loading}
                  keyOptions={filter.keyOptions}
                  availableValues={filter.availableValues}
                  value={filter.value}
                  onChange={filter.onChange}
                  isActive={filter.isActive}
                  onReset={filter.onReset}
                />
              );
            }

            if (filter.type === "numericKeyValue") {
              return (
                <NumericKeyValueFacet
                  key={filter.column}
                  filterKey={filter.column}
                  filterKeyShort={filter.shortKey}
                  label={filter.label}
                  expanded={filter.expanded}
                  loading={filter.loading}
                  keyOptions={filter.keyOptions}
                  value={filter.value}
                  onChange={filter.onChange}
                  isActive={filter.isActive}
                  onReset={filter.onReset}
                />
              );
            }

            if (filter.type === "stringKeyValue") {
              return (
                <StringKeyValueFacet
                  key={filter.column}
                  filterKey={filter.column}
                  filterKeyShort={filter.shortKey}
                  label={filter.label}
                  expanded={filter.expanded}
                  loading={filter.loading}
                  keyOptions={filter.keyOptions}
                  value={filter.value}
                  onChange={filter.onChange}
                  isActive={filter.isActive}
                  onReset={filter.onReset}
                />
              );
            }

            return null;
          })}
        </Accordion>
      </div>
    </div>
  );
}

interface BaseFacetProps {
  label: string;
  children?: React.ReactNode;
  filterKey: string;
  filterKeyShort?: string | null;
  expanded?: boolean;
  loading?: boolean;
  isActive?: boolean;
  onReset?: () => void;
}

interface CategoricalFacetProps extends BaseFacetProps {
  options: string[];
  counts: Map<string, number>;
  value: string[];
  onChange: (values: string[]) => void;
  onOnlyChange?: (value: string) => void;
}

interface NumericFacetProps extends BaseFacetProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  unit?: string;
}

interface StringFacetProps extends BaseFacetProps {
  value: string;
  onChange: (value: string) => void;
}

interface KeyValueFacetProps extends BaseFacetProps {
  keyOptions?: string[];
  availableValues: Record<string, string[]>;
  value: KeyValueFilterEntry[];
  onChange: (filters: KeyValueFilterEntry[]) => void;
}

interface NumericKeyValueFacetProps extends BaseFacetProps {
  keyOptions?: string[];
  value: NumericKeyValueFilterEntry[];
  onChange: (filters: NumericKeyValueFilterEntry[]) => void;
}

interface StringKeyValueFacetProps extends BaseFacetProps {
  keyOptions?: string[];
  value: StringKeyValueFilterEntry[];
  onChange: (filters: StringKeyValueFilterEntry[]) => void;
}

// Non-animated accordion components for filters
const FilterAccordionItemPrimitive = AccordionPrimitive.Item;

const FilterAccordionTrigger = ({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      className={cn(
        "flex flex-1 items-center justify-between font-medium hover:underline [&[data-state=open]>svg]:rotate-180",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
);

const FilterAccordionContent = ({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>) => (
  <AccordionPrimitive.Content className="overflow-hidden text-sm" {...props}>
    <div className={cn("pb-2 pt-1", className)}>{children}</div>
  </AccordionPrimitive.Content>
);

interface FilterAccordionItemProps {
  label: string;
  filterKey: string;
  filterKeyShort?: string | null;
  children: React.ReactNode;
  isActive?: boolean;
  onReset?: () => void;
}

export function FilterAccordionItem({
  label,
  filterKey,
  filterKeyShort,
  children,
  isActive,
  onReset,
}: FilterAccordionItemProps) {
  return (
    <FilterAccordionItemPrimitive value={filterKey} className="border-none">
      <FilterAccordionTrigger className="px-4 py-2 text-sm font-normal text-muted-foreground hover:text-foreground hover:no-underline">
        <div className="flex grow items-center gap-1.5 pr-2">
          <span className="flex grow items-baseline gap-1">
            {label}
            {filterKeyShort && (
              <code className="hidden font-mono text-xs text-muted-foreground/70">
                {filterKeyShort}
              </code>
            )}
          </span>
          {isActive && onReset && (
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  onReset();
                }
              }}
              className="inline-flex h-5 cursor-pointer items-center gap-1 rounded-full border bg-background px-2 text-xs hover:bg-accent hover:text-accent-foreground"
              aria-label={`Clear ${label} filter`}
            >
              <span>Clear</span>
              <IconX className="h-3 w-3" />
            </div>
          )}
        </div>
      </FilterAccordionTrigger>
      <FilterAccordionContent className="pb-2">
        {children}
      </FilterAccordionContent>
    </FilterAccordionItemPrimitive>
  );
}

export function CategoricalFacet({
  label,
  filterKey,
  filterKeyShort,
  expanded,
  loading,
  options,
  counts,
  value,
  onChange,
  onOnlyChange,
  isActive,
  onReset,
}: CategoricalFacetProps) {
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Reset showAll and searchQuery state when accordion is collapsed
  useEffect(() => {
    if (!expanded) {
      setShowAll(false);
      setSearchQuery("");
    }
  }, [expanded]);

  const MAX_VISIBLE_OPTIONS = 12;
  const hasMoreOptions = options.length > MAX_VISIBLE_OPTIONS;

  // Filter options by search query
  const filteredOptions = searchQuery
    ? options.filter((option) =>
        option.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : options;

  const hasMoreFilteredOptions = filteredOptions.length > MAX_VISIBLE_OPTIONS;
  const visibleOptions = showAll
    ? filteredOptions
    : filteredOptions.slice(0, MAX_VISIBLE_OPTIONS);

  return (
    <FilterAccordionItem
      label={label}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      onReset={onReset}
    >
      <div className="flex flex-col px-2">
        {loading ? (
          <div className="pl-4 text-sm text-muted-foreground">Loading...</div>
        ) : options.length === 0 ? (
          <div className="py-1 text-center text-sm text-muted-foreground">
            No options found
          </div>
        ) : (
          <>
            {hasMoreOptions && (
              <div className="mb-2 px-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Filter values"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-7 text-xs"
                  />
                </div>
              </div>
            )}
            {filteredOptions.length === 0 ? (
              <div className="py-1 text-center text-sm text-muted-foreground">
                No matches found
              </div>
            ) : (
              <>
                {visibleOptions.map((option: string) => (
                  <FilterValueCheckbox
                    key={option}
                    id={`${filterKey}-${option}`}
                    label={option}
                    count={counts.get(option) || 0}
                    checked={value.includes(option)}
                    onCheckedChange={(checked) => {
                      const newValues = checked
                        ? [...value, option]
                        : value.filter((v: string) => v !== option);
                      onChange(newValues);
                    }}
                    onLabelClick={
                      onOnlyChange ? () => onOnlyChange(option) : undefined
                    }
                    totalSelected={value.length}
                  />
                ))}
                {hasMoreFilteredOptions && !showAll && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAll(true)}
                    className="text-normal mt-1 h-auto justify-start px-2 py-1 pl-8 text-xs"
                  >
                    Show more values
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </FilterAccordionItem>
  );
}

export function NumericFacet({
  label,
  filterKey,
  filterKeyShort,
  expanded: _expanded,
  loading,
  min,
  max,
  value,
  onChange,
  unit,
  isActive,
  onReset,
}: NumericFacetProps) {
  const [localValue, setLocalValue] = useState<[number, number]>(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const updateWithDebounce = (newValue: [number, number]) => {
    setLocalValue(newValue);

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      onChange(newValue);
    }, 120);
  };

  const handleSliderChange = (values: number[]) => {
    if (values.length === 2) {
      const newValue: [number, number] = [values[0], values[1]];
      updateWithDebounce(newValue);
    }
  };

  const handleMinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // If input is cleared, reset to default min
    if (inputValue === "") {
      const newValue: [number, number] = [min, localValue[1]];
      updateWithDebounce(newValue);
      return;
    }
    const newMin = parseFloat(inputValue);
    if (isNaN(newMin)) return;
    const newValue: [number, number] = [newMin, localValue[1]];
    updateWithDebounce(newValue);
  };

  const handleMaxInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // If input is cleared, reset to default max
    if (inputValue === "") {
      const newValue: [number, number] = [localValue[0], max];
      updateWithDebounce(newValue);
      return;
    }
    const newMax = parseFloat(inputValue);
    if (isNaN(newMax)) return;
    const newValue: [number, number] = [localValue[0], newMax];
    updateWithDebounce(newValue);
  };

  return (
    <FilterAccordionItem
      label={label}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      onReset={onReset}
    >
      <div className="px-4 py-2">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-center gap-4">
              <div className="grid w-full gap-1.5">
                <Label
                  htmlFor={`min-${filterKey}`}
                  className="text-xs text-muted-foreground"
                >
                  Min.
                </Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    id={`min-${filterKey}`}
                    value={isActive ? localValue[0] : ""}
                    placeholder={String(min)}
                    min={min}
                    step="any"
                    onChange={handleMinInputChange}
                    className="h-8"
                  />
                  {unit && (
                    <span className="text-xs text-muted-foreground">
                      {unit}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid w-full gap-1.5">
                <Label
                  htmlFor={`max-${filterKey}`}
                  className="text-xs text-muted-foreground"
                >
                  Max.
                </Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    id={`max-${filterKey}`}
                    value={isActive ? localValue[1] : ""}
                    placeholder={String(max)}
                    min={min}
                    step="any"
                    onChange={handleMaxInputChange}
                    className="h-8"
                  />
                  {unit && (
                    <span className="text-xs text-muted-foreground">
                      {unit}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Slider
              min={min}
              max={max}
              step={1}
              value={localValue}
              onValueChange={handleSliderChange}
            />
          </div>
        )}
      </div>
    </FilterAccordionItem>
  );
}

export function StringFacet({
  label,
  filterKey,
  filterKeyShort,
  expanded: _expanded,
  loading,
  value,
  onChange,
  isActive,
  onReset,
}: StringFacetProps) {
  const [localValue, setLocalValue] = useState<string>(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const updateWithDebounce = (newValue: string) => {
    setLocalValue(newValue);

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      onChange(newValue);
    }, 500);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateWithDebounce(e.target.value);
  };

  return (
    <FilterAccordionItem
      label={label}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      onReset={onReset}
    >
      <div className="px-4">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : (
          <Input
            type="text"
            id={`string-${filterKey}`}
            value={localValue}
            placeholder="Search"
            onChange={handleInputChange}
            className="h-8"
          />
        )}
      </div>
    </FilterAccordionItem>
  );
}

export function KeyValueFacet({
  label,
  filterKey,
  filterKeyShort,
  expanded: _expanded,
  loading,
  keyOptions,
  availableValues,
  value,
  onChange,
  isActive,
  onReset,
}: KeyValueFacetProps) {
  return (
    <FilterAccordionItem
      label={label}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      onReset={onReset}
    >
      {loading ? (
        <div className="px-4 py-2 text-sm text-muted-foreground">
          Loading...
        </div>
      ) : (
        <KeyValueFilterBuilder
          mode="categorical"
          keyOptions={keyOptions}
          availableValues={availableValues}
          activeFilters={value}
          onChange={onChange}
        />
      )}
    </FilterAccordionItem>
  );
}

export function NumericKeyValueFacet({
  label,
  filterKey,
  filterKeyShort,
  expanded: _expanded,
  loading,
  keyOptions,
  value,
  onChange,
  isActive,
  onReset,
}: NumericKeyValueFacetProps) {
  return (
    <FilterAccordionItem
      label={label}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      onReset={onReset}
    >
      {loading ? (
        <div className="px-4 py-2 text-sm text-muted-foreground">
          Loading...
        </div>
      ) : (
        <KeyValueFilterBuilder
          mode="numeric"
          keyOptions={keyOptions}
          activeFilters={value}
          onChange={onChange}
        />
      )}
    </FilterAccordionItem>
  );
}

export function StringKeyValueFacet({
  label,
  filterKey,
  filterKeyShort,
  expanded: _expanded,
  loading,
  keyOptions,
  value,
  onChange,
  isActive,
  onReset,
}: StringKeyValueFacetProps) {
  return (
    <FilterAccordionItem
      label={label}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      onReset={onReset}
    >
      {loading ? (
        <div className="px-4 py-2 text-sm text-muted-foreground">
          Loading...
        </div>
      ) : (
        <KeyValueFilterBuilder
          mode="string"
          keyOptions={keyOptions}
          activeFilters={value}
          onChange={onChange}
        />
      )}
    </FilterAccordionItem>
  );
}

interface FilterValueCheckboxProps {
  id: string;
  label: string;
  count: number;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onLabelClick?: () => void; // For "only this" behavior
  totalSelected?: number;
}

export function FilterValueCheckbox({
  id,
  label,
  count,
  checked = false,
  onCheckedChange,
  onLabelClick,
  totalSelected,
}: FilterValueCheckboxProps) {
  // Show "All" when clicking would reverse selection (only one item selected)
  const labelText = checked && totalSelected === 1 ? "All" : "Only";

  return (
    <div className="relative flex items-center px-2">
      {/* Checkbox hover area */}
      <div className="group/checkbox flex items-center rounded-sm p-1 transition-colors hover:bg-accent">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="pointer-events-auto"
        />
      </div>

      {/* Label hover area */}
      <div
        className="group/label flex min-w-0 flex-1 cursor-pointer items-center rounded-sm px-1 py-1 transition-colors hover:bg-accent"
        onClick={onLabelClick}
      >
        <span className="min-w-0 flex-1 truncate text-xs">{label}</span>

        {/* "Only" or "All" indicator when hovering label */}
        {onLabelClick && (
          <span className="hidden pl-1 text-xs text-muted-foreground group-hover/label:block">
            {labelText}
          </span>
        )}

        {count > 0 ? (
          <span className="ml-auto w-7 pl-1 text-right text-xs text-muted-foreground">
            {compactNumberFormatter(count, 0)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function DataTableControlsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <div>{children}</div>
    </div>
  );
}
