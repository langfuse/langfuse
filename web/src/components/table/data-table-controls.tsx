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
import { X as IconX } from "lucide-react";
import type { UIFilter } from "@/src/features/filters/hooks/use-filter-state-new";

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
        "h-full w-full border-r bg-background sm:block sm:min-w-52 sm:max-w-52 md:min-w-64 md:max-w-64",
        "group-data-[expanded=false]/controls:hidden",
      )}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex h-[49px] items-center justify-between border-b px-4">
          <h2 className="text-sm font-medium">Filters</h2>
          {queryFilter.isFiltered ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={queryFilter.clearAll}
                  className="h-auto px-2 py-1 text-xs"
                >
                  <IconX className="mr-1 h-3 w-3" />
                  Reset
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span>Reset all filters</span>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        {/* Scrollable content */}
        <div className="flex-1 overflow-auto">
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
                  />
                );
              }

              return null;
            })}
          </Accordion>
        </div>
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

interface FilterAccordionItemProps {
  label: string;
  filterKey: string;
  filterKeyShort?: string | null;
  children: React.ReactNode;
}

export function FilterAccordionItem({
  label,
  filterKey,
  filterKeyShort,
  children,
}: FilterAccordionItemProps) {
  return (
    <AccordionItem value={filterKey} className="border-none">
      <AccordionTrigger className="px-4 pb-2 pt-3 text-sm font-normal text-muted-foreground hover:text-foreground hover:no-underline">
        <span className="flex items-baseline gap-1">
          {label}
          {filterKeyShort && (
            <code className="hidden font-mono text-xs text-muted-foreground/70">
              {filterKeyShort}
            </code>
          )}
        </span>
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

interface FilterValueCheckboxProps {
  id: string;
  label: string;
  count: number;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onLabelClick?: () => void; // For "only this" behavior
}

export function FilterValueCheckbox({
  id,
  label,
  count,
  checked = false,
  onCheckedChange,
  onLabelClick,
}: FilterValueCheckboxProps) {
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

        {/* "Only" indicator when hovering label */}
        {onLabelClick && (
          <span className="hidden pl-1 text-xs text-muted-foreground group-hover/label:block">
            Only
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
