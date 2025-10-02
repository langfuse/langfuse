import { createContext, useContext, useState, useEffect, useRef } from "react";
import useLocalStorage from "@/src/components/useLocalStorage";
import { cn } from "@/src/utils/tailwind";
import { compactNumberFormatter } from "@/src/utils/numbers";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/src/components/ui/accordion";
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
import { X as IconX, Filter as IconFilter } from "lucide-react";
import type {
  UIFilter,
  KeyValueFilterEntry,
  NumericKeyValueFilterEntry,
  StringKeyValueFilterEntry,
} from "@/src/features/filters/hooks/use-filter-state-new";
import { KeyValueFilterBuilder } from "@/src/components/table/key-value-filter-builder";

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
    throw new Error(
      "useDataTableControls must be used within a DataTableControlsProvider",
    );
  }

  return context as ControlsContextType;
}

export interface QueryFilter {
  filters: UIFilter[];
  expanded: string[];
  onExpandedChange: (value: string[]) => void;
  clearAll: () => void;
  isFiltered: boolean;
}

interface DataTableControlsProps {
  queryFilter: QueryFilter;
}

export function DataTableControls({ queryFilter }: DataTableControlsProps) {
  return (
    <div
      className={cn(
        "h-full w-full border-r border-t bg-background sm:block sm:min-w-52 sm:max-w-52 md:min-w-64 md:max-w-64",
        "group-data-[expanded=false]/controls:hidden",
      )}
    >
      <div className="flex h-full flex-col overflow-auto">
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
    <AccordionItem value={filterKey} className="border-none">
      <AccordionTrigger className="px-4 pb-2 pt-3 text-sm font-normal text-muted-foreground hover:text-foreground hover:no-underline">
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
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex h-4 items-center">
                  <span
                    className="flex h-full cursor-default items-center rounded-l border border-input bg-background px-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconFilter className="h-2.5 w-2.5 text-muted-foreground" />
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReset();
                    }}
                    className="-ml-px flex h-full items-center rounded-r bg-primary px-1 hover:bg-primary/90"
                    aria-label={`Reset ${label} filter`}
                  >
                    <IconX className="h-2.5 w-2.5 text-primary-foreground" />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <span>Reset</span>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-2">{children}</AccordionContent>
    </AccordionItem>
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

  // Reset showAll state when accordion is collapsed
  useEffect(() => {
    if (!expanded) {
      setShowAll(false);
    }
  }, [expanded]);

  const MAX_VISIBLE_OPTIONS = 12;
  const hasMoreOptions = options.length > MAX_VISIBLE_OPTIONS;
  const visibleOptions = showAll
    ? options
    : options.slice(0, MAX_VISIBLE_OPTIONS);

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
          <div className="pl-4 text-sm text-muted-foreground">
            No options found
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
            {hasMoreOptions && !showAll && (
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
    const newMin = parseFloat(e.target.value);
    if (isNaN(newMin)) return;
    const newValue: [number, number] = [newMin, localValue[1]];
    updateWithDebounce(newValue);
  };

  const handleMaxInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMax = parseFloat(e.target.value);
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
                    value={localValue[0]}
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
                    value={localValue[1]}
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
      <div className="px-4 py-2">
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
