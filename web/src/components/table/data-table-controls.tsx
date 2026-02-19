import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { useMediaQuery } from "react-responsive";
import useSessionStorage from "@/src/components/useSessionStorage";
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
import { Skeleton } from "@/src/components/ui/skeleton";
import { X as IconX, Search, WandSparkles } from "lucide-react";
import type {
  UIFilter,
  KeyValueFilterEntry,
  NumericKeyValueFilterEntry,
  StringKeyValueFilterEntry,
  TextFilterEntry,
  PositionInTraceMode,
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
  tableName?: string;
}

export const ControlsContext = createContext<ControlsContextType | null>(null);

export function DataTableControlsProvider({
  children,
  tableName,
  defaultSidebarCollapsed,
}: {
  children: React.ReactNode;
  tableName?: string;
  defaultSidebarCollapsed?: boolean;
}) {
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });
  const storageKey = tableName
    ? `data-table-controls-${tableName}`
    : "data-table-controls";
  const defaultOpen = isDesktop ? !defaultSidebarCollapsed : false;
  const [open, setOpen] = useSessionStorage(storageKey, defaultOpen);

  return (
    <ControlsContext.Provider value={{ open, setOpen, tableName }}>
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
    return { open: false, setOpen: () => {}, tableName: undefined };
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
        "flex h-full w-full flex-col overflow-auto border-t bg-background",
        "group-data-[expanded=false]/controls:hidden",
      )}
    >
      <div className="sticky top-0 z-20 mb-1 flex h-10 shrink-0 items-center justify-between border-b bg-background px-3">
        <span className="text-sm font-medium">Filters</span>
        <div className="flex items-center gap-1">
          {queryFilter.isFiltered && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => queryFilter.clearAll()}
                  className="h-7 px-2 text-xs"
                >
                  Clear all
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear all filters</TooltipContent>
            </Tooltip>
          )}
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
      </div>
      <div className="pb-10">
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
                  operator={filter.operator}
                  onOperatorChange={filter.onOperatorChange}
                  textFilters={filter.textFilters}
                  onTextFilterAdd={filter.onTextFilterAdd}
                  onTextFilterRemove={filter.onTextFilterRemove}
                  isDisabled={filter.isDisabled}
                  disabledReason={filter.disabledReason}
                />
              );
            }

            if (filter.type === "numeric") {
              return (
                <NumericFacet
                  key={filter.column}
                  filterKey={filter.column}
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
                  isDisabled={filter.isDisabled}
                  disabledReason={filter.disabledReason}
                />
              );
            }

            if (filter.type === "string") {
              return (
                <StringFacet
                  key={filter.column}
                  filterKey={filter.column}
                  label={filter.label}
                  expanded={filter.expanded}
                  loading={filter.loading}
                  value={filter.value}
                  onChange={filter.onChange}
                  isActive={filter.isActive}
                  onReset={filter.onReset}
                  isDisabled={filter.isDisabled}
                  disabledReason={filter.disabledReason}
                />
              );
            }

            if (filter.type === "keyValue") {
              return (
                <KeyValueFacet
                  key={filter.column}
                  filterKey={filter.column}
                  label={filter.label}
                  expanded={filter.expanded}
                  loading={filter.loading}
                  keyOptions={filter.keyOptions}
                  availableValues={filter.availableValues}
                  value={filter.value}
                  onChange={filter.onChange}
                  isActive={filter.isActive}
                  onReset={filter.onReset}
                  keyPlaceholder="Name"
                  isDisabled={filter.isDisabled}
                  disabledReason={filter.disabledReason}
                />
              );
            }

            if (filter.type === "numericKeyValue") {
              return (
                <NumericKeyValueFacet
                  key={filter.column}
                  filterKey={filter.column}
                  label={filter.label}
                  expanded={filter.expanded}
                  loading={filter.loading}
                  keyOptions={filter.keyOptions}
                  value={filter.value}
                  onChange={filter.onChange}
                  isActive={filter.isActive}
                  onReset={filter.onReset}
                  keyPlaceholder="Name"
                  isDisabled={filter.isDisabled}
                  disabledReason={filter.disabledReason}
                />
              );
            }

            if (filter.type === "stringKeyValue") {
              return (
                <StringKeyValueFacet
                  key={filter.column}
                  filterKey={filter.column}
                  label={filter.label}
                  expanded={filter.expanded}
                  loading={filter.loading}
                  keyOptions={filter.keyOptions}
                  value={filter.value}
                  onChange={filter.onChange}
                  isActive={filter.isActive}
                  onReset={filter.onReset}
                  isDisabled={filter.isDisabled}
                  disabledReason={filter.disabledReason}
                />
              );
            }

            if (filter.type === "positionInTrace") {
              return (
                <PositionInTraceFacetComponent
                  key={filter.column}
                  filterKey={filter.column}
                  label={filter.label}
                  expanded={filter.expanded}
                  loading={filter.loading}
                  mode={filter.mode}
                  nthValue={filter.nthValue}
                  onModeChange={filter.onModeChange}
                  onNthValueChange={filter.onNthValueChange}
                  isActive={filter.isActive}
                  onReset={filter.onReset}
                  isDisabled={filter.isDisabled}
                  disabledReason={filter.disabledReason}
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
  isDisabled?: boolean;
  disabledReason?: string;
  onReset?: () => void;
}

interface CategoricalFacetProps extends BaseFacetProps {
  options: string[];
  counts: Map<string, number>;
  value: string[];
  onChange: (values: string[]) => void;
  onOnlyChange?: (value: string) => void;
  operator?: "any of" | "all of";
  onOperatorChange?: (operator: "any of" | "all of") => void;
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
  keyPlaceholder?: string;
}

interface NumericKeyValueFacetProps extends BaseFacetProps {
  keyOptions?: string[];
  value: NumericKeyValueFilterEntry[];
  onChange: (filters: NumericKeyValueFilterEntry[]) => void;
  keyPlaceholder?: string;
}

interface StringKeyValueFacetProps extends BaseFacetProps {
  keyOptions?: string[];
  value: StringKeyValueFilterEntry[];
  onChange: (filters: StringKeyValueFilterEntry[]) => void;
  keyPlaceholder?: string;
}

// Non-animated accordion components for filters
const FilterAccordionItemPrimitive = AccordionPrimitive.Item;

const FilterAccordionTrigger = ({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>) => (
  <AccordionPrimitive.Header className="sticky top-10 z-10 flex bg-background">
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
  isDisabled?: boolean;
  disabledReason?: string;
  onReset?: () => void;
}

export function FilterAccordionItem({
  label,
  filterKey,
  filterKeyShort,
  children,
  isActive,
  isDisabled,
  disabledReason,
  onReset,
}: FilterAccordionItemProps) {
  return (
    <FilterAccordionItemPrimitive value={filterKey} className="border-none">
      <FilterAccordionTrigger
        className={cn(
          "px-3 py-1.5 text-sm font-normal text-muted-foreground hover:text-foreground hover:no-underline",
          isDisabled &&
            "cursor-not-allowed text-muted-foreground/60 hover:text-muted-foreground/60",
        )}
      >
        <div className="flex grow items-center gap-1.5 pr-2">
          {isDisabled && disabledReason ? (
            <Tooltip delayDuration={80}>
              <TooltipTrigger asChild>
                <span className="flex grow items-baseline gap-1">
                  {label}
                  {filterKeyShort && (
                    <code className="hidden font-mono text-xs text-muted-foreground/70">
                      {filterKeyShort}
                    </code>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-80 text-xs">
                {disabledReason}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="flex grow items-baseline gap-1">
              {label}
              {filterKeyShort && (
                <code className="hidden font-mono text-xs text-muted-foreground/70">
                  {filterKeyShort}
                </code>
              )}
            </span>
          )}
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
        <fieldset
          disabled={isDisabled}
          className={cn(
            "m-0 min-w-0 border-0 p-0",
            isDisabled && "pointer-events-none opacity-60",
          )}
        >
          {children}
        </fieldset>
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
  isDisabled,
  disabledReason,
  onReset,
  operator,
  onOperatorChange,
  textFilters,
  onTextFilterAdd,
  onTextFilterRemove,
}: CategoricalFacetProps) {
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Track which filter mode is active (select checkboxes vs text filters)
  const [filterMode, setFilterMode] = useState<"select" | "text">("select");

  // Reset showAll and searchQuery state when accordion is collapsed
  useEffect(() => {
    if (!expanded) {
      setShowAll(false);
      setSearchQuery("");
    }
  }, [expanded]);

  // Handle mode change with auto-clear of filters from the other mode
  const handleModeChange = useCallback(
    (newMode: "select" | "text") => {
      setFilterMode(newMode);

      // Clear filters from the other mode
      if (newMode === "select") {
        textFilters?.forEach((f) => onTextFilterRemove?.(f.operator, f.value));
      } else {
        onChange([]);
      }
    },
    [textFilters, onTextFilterRemove, onChange],
  );

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
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      onReset={onReset}
    >
      <div className="flex flex-col">
        {/* Tab switcher - only show when text filtering is supported */}
        {onTextFilterAdd && (
          <FilterModeTabs mode={filterMode} onModeChange={handleModeChange} />
        )}

        {/* SELECT MODE: Checkboxes with optional counts */}
        {filterMode === "select" && (
          <div className="px-2">
            {/* SOME/ALL Operator Toggle for arrayOptions filters

                This toggle appears for multi-valued array columns (arrayOptions) like tags.
                It allows switching between OR and AND logic:
                - SOME: Match items with ANY selected value (OR logic)
                - ALL: Match items with ALL selected values (AND logic)

                The toggle is automatically enabled by useSidebarFilterState for any
                arrayOptions column when selections exist. Other filter types (stringOptions,
                boolean, numeric) don't get this toggle as "ALL" wouldn't be semantically meaningful.

                Currently enabled for:
                - Traces: tags
                - Sessions: userIds, tags
                - Prompts: labels, tags
            */}
            {onOperatorChange && value.length > 0 && (
              <div className="mb-1.5 flex items-center gap-1.5 px-2">
                <span className="text-[10px] text-muted-foreground/80">
                  Match:
                </span>
                <div className="inline-flex rounded border border-input/50 bg-background text-[10px]">
                  <button
                    onClick={() => onOperatorChange("any of")}
                    className={cn(
                      "rounded-l px-1.5 py-0.5 transition-colors",
                      operator === "any of" || !operator
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    SOME
                  </button>
                  <div className="w-px bg-border/50" />
                  <button
                    onClick={() => onOperatorChange("all of")}
                    className={cn(
                      "rounded-r px-1.5 py-0.5 transition-colors",
                      operator === "all of"
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    ALL
                  </button>
                </div>
              </div>
            )}

            {/* Loading / Empty / Options */}
            {loading ? (
              <>
                {[1, 2].map((i) => (
                  <div key={i} className="relative flex items-center px-2">
                    <div className="group/checkbox flex items-center rounded-sm p-1">
                      <Skeleton className="h-4 w-4 rounded-sm" />
                    </div>
                    <div className="group/label flex min-w-0 flex-1 items-center rounded-sm px-1 py-1">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="ml-auto h-3 w-8" />
                    </div>
                  </div>
                ))}
              </>
            ) : options.length === 0 ? (
              <div className="py-1 text-xs text-muted-foreground">
                {filterKey === "sessionId" ? (
                  <span>
                    Sessions group traces together, which is useful for tracing
                    multi-step workflows.{" "}
                    <a
                      href="https://langfuse.com/docs/observability/features/sessions"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      See docs
                    </a>{" "}
                    to learn how to add sessions to your traces.
                  </span>
                ) : filterKey === "name" ? (
                  <span>No trace names found in the given time range.</span>
                ) : filterKey === "tags" ? (
                  <span>
                    Tags let you filter traces according to custom categories
                    (e.g. feature flags).{" "}
                    <a
                      href="https://langfuse.com/docs/observability/features/tags"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      See docs
                    </a>{" "}
                    to learn how to add tags to your traces.
                  </span>
                ) : (
                  "No options found"
                )}
              </div>
            ) : (
              <>
                {/* Search box for many options */}
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

                {/* Checkbox list */}
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
                      <div className="px-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAll(true)}
                          className="text-normal mt-1 h-auto w-full justify-start py-1 pl-7 text-xs"
                        >
                          Show more values
                        </Button>
                      </div>
                    )}
                  </>
                )}
                {filterKey === "environment" &&
                options.length === 1 &&
                options[0]?.toLowerCase() === "default" ? (
                  <div className="mt-2 px-2 text-xs text-muted-foreground">
                    Environments help you separate traces from different
                    contexts (e.g. production, staging).{" "}
                    <a
                      href="https://langfuse.com/docs/observability/features/environments"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      See docs
                    </a>{" "}
                    on how to add environments to your traces.
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}

        {/* TEXT MODE: Contains/Does Not Contain filters */}
        {filterMode === "text" && onTextFilterAdd && (
          <div className="px-2 py-1">
            <TextFilterSection
              allFilters={textFilters ?? []}
              onAdd={onTextFilterAdd}
              onRemove={onTextFilterRemove}
            />
          </div>
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
  isDisabled,
  disabledReason,
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
      isDisabled={isDisabled}
      disabledReason={disabledReason}
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
              step={max - min <= 1000 ? 0.01 : 1}
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
  isDisabled,
  disabledReason,
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
      isDisabled={isDisabled}
      disabledReason={disabledReason}
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
  isDisabled,
  disabledReason,
  onReset,
  keyPlaceholder,
}: KeyValueFacetProps) {
  return (
    <FilterAccordionItem
      label={label}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
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
          keyPlaceholder={keyPlaceholder}
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
  isDisabled,
  disabledReason,
  onReset,
  keyPlaceholder,
}: NumericKeyValueFacetProps) {
  return (
    <FilterAccordionItem
      label={label}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
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
          keyPlaceholder={keyPlaceholder}
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
  isDisabled,
  disabledReason,
  onReset,
  keyPlaceholder,
}: StringKeyValueFacetProps) {
  return (
    <FilterAccordionItem
      label={label}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
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
          keyPlaceholder={keyPlaceholder}
        />
      )}
    </FilterAccordionItem>
  );
}

interface PositionInTraceFacetProps extends BaseFacetProps {
  mode: PositionInTraceMode | null;
  nthValue: number;
  onModeChange: (mode: PositionInTraceMode | null) => void;
  onNthValueChange: (value: number) => void;
}

const POSITION_MODES: {
  key: PositionInTraceMode;
  label: string;
}[] = [
  { key: "root", label: "Root" },
  { key: "last", label: "Last" },
  { key: "nthFromStart", label: "Nth from start" },
  { key: "nthFromEnd", label: "Nth from end" },
];

function PositionInTraceFacetComponent({
  label,
  filterKey,
  filterKeyShort,
  expanded: _expanded,
  loading,
  mode,
  nthValue,
  onModeChange,
  onNthValueChange,
  isActive,
  isDisabled,
  disabledReason,
  onReset,
}: PositionInTraceFacetProps) {
  const showNthInput = mode === "nthFromStart" || mode === "nthFromEnd";

  return (
    <FilterAccordionItem
      label={label}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      onReset={onReset}
    >
      <div className="px-4 py-1">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {POSITION_MODES.map(({ key, label: modeLabel }) => (
                <button
                  key={key}
                  onClick={() => onModeChange(mode === key ? null : key)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition-colors",
                    mode === key
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {modeLabel}
                </button>
              ))}
            </div>
            {showNthInput && (
              <div className="flex items-center gap-2">
                <Label
                  htmlFor={`nth-${filterKey}`}
                  className="text-xs text-muted-foreground"
                >
                  Position:
                </Label>
                <Input
                  id={`nth-${filterKey}`}
                  type="number"
                  min={1}
                  step={1}
                  value={nthValue}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) onNthValueChange(v);
                  }}
                  className="h-7 w-20 text-xs"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </FilterAccordionItem>
  );
}

// Filter mode tabs for switching between Select (checkboxes) and Text (contains) modes
interface FilterModeTabsProps {
  mode: "select" | "text";
  onModeChange: (mode: "select" | "text") => void;
}

function FilterModeTabs({ mode, onModeChange }: FilterModeTabsProps) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 px-4 @container">
      <span className="text-[10px] text-muted-foreground/80">Mode:</span>
      <div className="flex flex-1 flex-col rounded border border-input/50 bg-background text-[10px] @[7.5rem]:min-w-[140px] @[7.5rem]:flex-row">
        <button
          onClick={() => onModeChange("select")}
          className={cn(
            "flex-1 rounded-t px-3 py-0.5 transition-colors @[7.5rem]:rounded-l @[7.5rem]:rounded-tr-none",
            mode === "select"
              ? "bg-accent font-medium text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          SELECT
        </button>
        <div className="h-px bg-border/50 @[7.5rem]:h-auto @[7.5rem]:w-px" />
        <button
          onClick={() => onModeChange("text")}
          className={cn(
            "flex-1 rounded-b px-3 py-0.5 transition-colors @[7.5rem]:rounded-r @[7.5rem]:rounded-bl-none",
            mode === "text"
              ? "bg-accent font-medium text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          TEXT
        </button>
      </div>
    </div>
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
      {/* Operator toggle */}
      <div className="flex items-center gap-1 px-2">
        <div className="inline-flex rounded border border-input/50 bg-background text-[10px]">
          <button
            onClick={() => setSelectedOperator("contains")}
            className={cn(
              "rounded-l px-2 py-0.5 transition-colors",
              selectedOperator === "contains"
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            contains
          </button>
          <div className="w-px bg-border/50" />
          <button
            onClick={() => setSelectedOperator("does not contain")}
            className={cn(
              "rounded-r px-2 py-0.5 transition-colors",
              selectedOperator === "does not contain"
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            does not contain
          </button>
        </div>
      </div>

      {/* Input + Add button */}
      <div className="flex items-center gap-2 px-2">
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
        <div className="space-y-1 px-2">
          {allFilters.map((f, idx) => (
            <div
              key={idx}
              className="group/textfilter flex items-center gap-2 rounded border border-border/40 bg-muted/30 px-2 py-1 text-xs"
            >
              <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                {f.operator === "contains" ? "contains" : "does not contain"}
              </span>
              <span
                className="min-w-0 flex-1 truncate font-medium"
                title={f.value}
              >
                {f.value}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemove?.(f.operator, f.value)}
                className="h-4 w-4 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/textfilter:opacity-100"
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
  count: number;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onLabelClick?: () => void; // For "only this" behavior
  totalSelected?: number;
  disabled?: boolean;
}

export function FilterValueCheckbox({
  id,
  label,
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
  const displayTitle = label === "" ? "(empty)" : label;

  return (
    <div
      className={cn(
        "relative flex items-center px-2",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {/* Checkbox hover area */}
      <div className="group/checkbox flex items-center rounded-sm p-1 transition-colors hover:bg-accent">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          className="pointer-events-auto"
        />
      </div>

      {/* Label hover area */}
      <div
        className={cn(
          "group/label flex min-w-0 flex-1 cursor-pointer items-center rounded-sm px-1 py-1 transition-colors hover:bg-accent",
          disabled && "pointer-events-none",
        )}
        onClick={onLabelClick}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-xs",
            label === "" && "italic text-muted-foreground",
          )}
          title={displayTitle}
        >
          {displayLabel}
        </span>

        {/* "Only" or "All" indicator when hovering label */}
        {onLabelClick && !disabled && (
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
