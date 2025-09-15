import { createContext, useContext, useState, useEffect } from "react";
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
import { X as IconX } from "lucide-react";

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

interface DataTableControlsProps {
  children: React.ReactNode;
  expanded: string[];
  onExpandedChange: (value: string[]) => void;
  onResetFilters?: () => void;
  hasActiveFilters?: boolean;
}

export function DataTableControls({
  children,
  expanded,
  onExpandedChange,
  onResetFilters,
  hasActiveFilters,
}: DataTableControlsProps) {
  return (
    <div
      className={cn(
        "h-full w-full border-r bg-background sm:block sm:min-w-52 sm:max-w-52 md:min-w-64 md:max-w-64",
        "group-data-[expanded=false]/controls:hidden",
      )}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 pb-3 pt-4">
          <h2 className="text-sm font-medium">Filters</h2>
          {onResetFilters && hasActiveFilters ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onResetFilters}
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
            value={expanded}
            onValueChange={onExpandedChange}
          >
            {children}
          </Accordion>
        </div>
      </div>
    </div>
  );
}

interface FilterAttributeProps {
  label: string;
  children?: React.ReactNode;
  filterKey: string;
  filterKeyShort?: string | null;
  expanded?: boolean;
  // Checkbox filter props
  value?: string[];
  options?: string[];
  counts?: Map<string, number>;
  loading?: boolean;
  onChange?: (values: string[]) => void;
}

export function FilterAttribute({
  label,
  children,
  filterKey,
  filterKeyShort,
  expanded,
  value,
  options,
  counts,
  loading,
  onChange,
}: FilterAttributeProps) {
  const [showAll, setShowAll] = useState(false);

  // Reset showAll state when accordion is collapsed
  useEffect(() => {
    if (!expanded) {
      setShowAll(false);
    }
  }, [expanded]);

  // If checkbox filter props are provided, render checkbox list
  const renderCheckboxes =
    value !== undefined && options !== undefined && onChange !== undefined;

  const MAX_VISIBLE_OPTIONS = 12;
  const hasMoreOptions = options && options.length > MAX_VISIBLE_OPTIONS;
  const visibleOptions =
    options && (showAll ? options : options.slice(0, MAX_VISIBLE_OPTIONS));

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
      <AccordionContent className="pb-2">
        {renderCheckboxes ? (
          <div className="flex flex-col px-2">
            {loading ? (
              <div className="pl-4 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : options.length === 0 ? (
              <div className="pl-4 text-sm text-muted-foreground">
                No options found
              </div>
            ) : (
              <>
                {visibleOptions.map((option) => (
                  <FilterValueCheckbox
                    key={option}
                    id={`${filterKey}-${option}`}
                    label={option}
                    count={counts?.get(option) || 0}
                    checked={value.includes(option)}
                    onCheckedChange={(checked) => {
                      const newValues = checked
                        ? [...value, option]
                        : value.filter((v) => v !== option);
                      onChange(newValues);
                    }}
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
        ) : (
          <div className="pl-4">{children}</div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

interface FilterValueCheckboxProps {
  id: string;
  label: string;
  count: number;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export function FilterValueCheckbox({
  id,
  label,
  count,
  checked = false,
  onCheckedChange,
}: FilterValueCheckboxProps) {
  return (
    <div className="flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-muted/50">
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <label htmlFor={id} className="min-w-0 truncate text-xs">
        {label}
      </label>
      {count !== undefined && count > 0 && (
        <span className="ml-auto text-xs text-muted-foreground">
          {compactNumberFormatter(count, 0)}
        </span>
      )}
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
