import type React from "react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  getFacetSummary,
  rankFacetOptions,
} from "@/src/features/filters/lib/facet-display";
import { useMediaQuery } from "react-responsive";
import useLocalStorage from "@/src/components/useLocalStorage";
import { cn } from "@/src/utils/tailwind";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { Accordion } from "@/src/components/ui/accordion";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
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
import { X as IconX, Search, WandSparkles, InfoIcon } from "lucide-react";
import DocPopup from "@/src/components/layouts/doc-popup";
import type {
  UIFilter,
  KeyValueFilterEntry,
  NumericKeyValueFilterEntry,
  BooleanKeyValueFilterEntry,
  StringKeyValueFilterEntry,
  TextFilterEntry,
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
  // The desktop preference persists across tabs and sessions (localStorage,
  // aligned with the peek-panel persistence direction — LFE-10601). Mobile
  // uses per-mount local state instead, so the filter panel never covers the
  // table by default and a narrow tab neither inherits nor overwrites the
  // desktop preference.
  const [desktopOpen, setDesktopOpen] = useLocalStorage(
    storageKey,
    !defaultSidebarCollapsed,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const open = isDesktop ? desktopOpen : mobileOpen;
  const setOpen = isDesktop ? setDesktopOpen : setMobileOpen;

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

// Stable sort into a previously captured column order; columns missing from
// the captured order keep their relative position at the end.
function sortFacetsByColumnOrder(
  filters: UIFilter[],
  order: string[],
): UIFilter[] {
  const index = new Map(order.map((column, i) => [column, i]));
  return [...filters].sort(
    (a, b) =>
      (index.get(a.column) ?? order.length) -
      (index.get(b.column) ?? order.length),
  );
}

export function DataTableControls({
  queryFilter,
  filterWithAI,
}: DataTableControlsProps) {
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { setOpen } = useDataTableControls();
  const [aiPopoverOpen, setAiPopoverOpen] = useState(false);
  const activeFilterCount = queryFilter.filters.filter(
    (filter) => filter.isActive,
  ).length;

  // Selected filters on top: facets with an active filter are promoted above
  // the rest (config order preserved within each group), so landing on a
  // filtered view — deep link, saved view, restored session — shows what is
  // filtered without scrolling. The order FREEZES on the first user
  // interaction with the sidebar: re-sorting live would teleport the facet a
  // user is ticking checkboxes in to the top of the list mid-interaction,
  // moving the very rows under their cursor. Until that first interaction the
  // order tracks activity live, which also covers URL filters that arrive a
  // few renders late (Pages Router populates query params after the first
  // render — see LFE-10164 in useSidebarFilterState). A remount (navigation,
  // saved-view switch) recomputes the promotion.
  const [frozenOrder, setFrozenOrder] = useState<string[] | null>(null);
  const orderedFilters = frozenOrder
    ? sortFacetsByColumnOrder(queryFilter.filters, frozenOrder)
    : [...queryFilter.filters].sort(
        (a, b) => Number(b.isActive) - Number(a.isActive),
      );
  const orderedColumns = orderedFilters.map((filter) => filter.column);
  const freezeFacetOrder = () => {
    setFrozenOrder((current) => current ?? orderedColumns);
  };

  const handleFiltersGenerated = useCallback(
    (filters: FilterState) => {
      // Un-freeze so the facets the AI just activated promote to the top —
      // opening the popover necessarily interacted with the panel earlier,
      // and nothing is under the user's cursor inside the list right now.
      setFrozenOrder(null);

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
    <>
      {/* Collapsed rail: shown when the sidebar is collapsed on desktop, where
          the resizable panel keeps a thin strip (see ResizableFilterLayout).
          Mirrors the trace peek's collapsed-panel rail. */}
      <div className="bg-background hidden h-full w-full flex-col items-center border-t group-data-[expanded=false]/controls:flex">
        {/* Mirror the expanded header's metrics (h-10 row, border-b, 24px
            button) so the toggle icon doesn't shift when collapsing. */}
        <div className="flex h-10 w-full shrink-0 items-center justify-center border-b">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(true)}
                aria-label="Show filters"
                className="h-6 w-6"
              >
                <PanelLeftOpen className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Show filters</TooltipContent>
          </Tooltip>
        </div>
        {activeFilterCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="mt-2 h-5 px-1.5 text-xs">
                {activeFilterCount}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="right">
              {activeFilterCount} active{" "}
              {activeFilterCount === 1 ? "filter" : "filters"}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div
        className={cn(
          "bg-background flex h-full w-full flex-col overflow-hidden border-t",
          "group-data-[expanded=false]/controls:hidden",
        )}
      >
        <div className="bg-background flex h-10 shrink-0 items-center justify-between border-b px-3">
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpen(false)}
                  aria-label="Hide filters"
                  className="-ml-1 h-6 w-6"
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Hide filters</TooltipContent>
            </Tooltip>
            <span className="text-sm font-medium">Filters</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {queryFilter.isFiltered && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      // Un-freeze so the list actually returns to config
                      // order (nothing is promoted once nothing is active).
                      setFrozenOrder(null);
                      queryFilter.clearAll();
                    }}
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
        <ScrollArea
          className="min-h-0 flex-1"
          // Capture-phase so the order freezes BEFORE the click that would
          // change it lands (see the frozenOrder comment above). Scoped to the
          // facet LIST: header actions (Clear all, AI filters) deliberately
          // stay live — clearing returns the list to config order, AI-applied
          // filters promote — since neither moves rows under the cursor.
          onPointerDownCapture={freezeFacetOrder}
          onKeyDownCapture={freezeFacetOrder}
          // Wheel too: a late-arriving URL filter must not reorder rows
          // while the user is scroll-reading the list.
          onWheelCapture={freezeFacetOrder}
        >
          <div className="pt-1 pb-10">
            <Accordion
              type="multiple"
              className="w-full"
              value={queryFilter.expanded}
              onValueChange={queryFilter.onExpandedChange}
            >
              {orderedFilters.map((filter) => {
                if (filter.type === "categorical") {
                  return (
                    <CategoricalFacet
                      key={filter.column}
                      filterKey={filter.column}
                      label={filter.label}
                      tooltip={filter.tooltip}
                      help={filter.help}
                      summary={getFacetSummary(filter)}
                      expanded={filter.expanded}
                      options={filter.options}
                      counts={filter.counts}
                      displayByValue={filter.displayByValue}
                      loading={filter.loading}
                      value={filter.value}
                      onChange={filter.onChange}
                      onOnlyChange={filter.onOnlyChange}
                      renderIcon={filter.renderIcon}
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
                      tooltip={filter.tooltip}
                      help={filter.help}
                      summary={getFacetSummary(filter)}
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
                      tooltip={filter.tooltip}
                      help={filter.help}
                      summary={getFacetSummary(filter)}
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
                      tooltip={filter.tooltip}
                      help={filter.help}
                      summary={getFacetSummary(filter)}
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
                      tooltip={filter.tooltip}
                      help={filter.help}
                      summary={getFacetSummary(filter)}
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

                if (filter.type === "booleanKeyValue") {
                  return (
                    <BooleanKeyValueFacet
                      key={filter.column}
                      filterKey={filter.column}
                      label={filter.label}
                      tooltip={filter.tooltip}
                      help={filter.help}
                      summary={getFacetSummary(filter)}
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
                      tooltip={filter.tooltip}
                      help={filter.help}
                      summary={getFacetSummary(filter)}
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

                return null;
              })}
            </Accordion>
          </div>
        </ScrollArea>
      </div>
    </>
  );
}

interface BaseFacetProps {
  label: string;
  tooltip?: string;
  help?: {
    description: React.ReactNode;
    href?: string;
  };
  /** One-line "what is selected?" header summary; see getFacetSummary. */
  summary?: string | null;
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
  displayByValue?: Map<string, string>;
  value: string[];
  onChange: (values: string[]) => void;
  onOnlyChange?: (value: string) => void;
  renderIcon?: (value: string) => React.ReactNode;
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

interface BooleanKeyValueFacetProps extends BaseFacetProps {
  keyOptions?: string[];
  value: BooleanKeyValueFilterEntry[];
  onChange: (filters: BooleanKeyValueFilterEntry[]) => void;
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
  // top-0: the panel header row sits outside the scroll container
  // (ScrollArea wraps only the facet list), so triggers stick to its top.
  <AccordionPrimitive.Header className="bg-background sticky top-0 z-10 flex">
    <AccordionPrimitive.Trigger
      className={cn(
        "flex flex-1 items-center justify-between text-left font-medium hover:underline [&[data-state=open]>svg]:rotate-180",
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
    <div className={cn("pt-1 pb-2", className)}>{children}</div>
  </AccordionPrimitive.Content>
);

interface FilterAccordionItemProps {
  label: string;
  tooltip?: string;
  help?: {
    description: React.ReactNode;
    href?: string;
  };
  /** One-line "what is selected?" summary rendered before the chevron. */
  summary?: string | null;
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
  tooltip,
  help,
  summary,
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
          "text-muted-foreground hover:text-foreground px-3 py-1.5 text-sm font-normal hover:no-underline",
          isActive && "text-foreground",
          isDisabled &&
            "text-muted-foreground/60 hover:text-muted-foreground/60 cursor-not-allowed",
        )}
      >
        <div className="flex min-w-0 grow items-center gap-1.5 pr-2">
          {isDisabled && disabledReason ? (
            <Tooltip delayDuration={80}>
              <TooltipTrigger asChild>
                <span className="flex grow items-baseline gap-1">
                  {label}
                  {filterKeyShort && (
                    <code className="text-muted-foreground/70 hidden font-mono text-xs">
                      {filterKeyShort}
                    </code>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-80 text-xs">
                {disabledReason}
              </TooltipContent>
            </Tooltip>
          ) : help ? (
            <div className="flex grow items-center gap-1">
              {label}
              <DocPopup description={help.description} href={help.href} />
              {filterKeyShort && (
                <code className="text-muted-foreground/70 hidden font-mono text-xs">
                  {filterKeyShort}
                </code>
              )}
            </div>
          ) : tooltip ? (
            <Tooltip delayDuration={80}>
              <TooltipTrigger asChild>
                <span className="flex grow items-center gap-1">
                  {label}
                  <InfoIcon className="text-muted-foreground h-3 w-3 shrink-0" />
                  {filterKeyShort && (
                    <code className="text-muted-foreground/70 hidden font-mono text-xs">
                      {filterKeyShort}
                    </code>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-80 text-xs">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="flex grow items-baseline gap-1">
              {label}
              {filterKeyShort && (
                <code className="text-muted-foreground/70 hidden font-mono text-xs">
                  {filterKeyShort}
                </code>
              )}
            </span>
          )}
          {summary && (
            // shrink-0 + own max-w: a long facet label wraps rather than
            // crushing the chip to nothing at the 200px minimum panel width.
            <span
              className={cn(
                "max-w-[8rem] shrink-0 truncate text-xs",
                isActive
                  ? "bg-accent text-accent-foreground rounded px-1.5 py-0.5 font-medium"
                  : "text-muted-foreground/60 font-normal",
              )}
              title={summary}
            >
              {summary}
            </span>
          )}
          {isActive && onReset && (
            <Tooltip delayDuration={80}>
              <TooltipTrigger asChild>
                {/* div[role=button], not <Button>: the accordion trigger is
                    already a <button> and buttons cannot nest. */}
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
                  className="text-muted-foreground hover:bg-accent hover:text-foreground -my-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm"
                  aria-label={`Clear ${label} filter`}
                >
                  <IconX className="h-3.5 w-3.5" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Clear {label.toLowerCase()} filter
              </TooltipContent>
            </Tooltip>
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
  tooltip,
  help,
  summary,
  filterKey,
  filterKeyShort,
  expanded: _expanded,
  loading,
  options,
  counts,
  displayByValue,
  value,
  onChange,
  onOnlyChange,
  renderIcon,
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
  // Which input mode the facet is in (checkbox select vs contains/does-not-
  // contain text). Seeded from the applied filters so a deep link carrying
  // text filters opens in text mode instead of hiding them behind the tab.
  const hasTextFilters = (textFilters?.length ?? 0) > 0;
  const [filterMode, setFilterMode] = useState<"select" | "text">(() =>
    hasTextFilters ? "text" : "select",
  );
  // Adopt DURING render as well: on a hard reload the Pages Router delivers
  // `?filter=` a few renders after mount (see the frozenOrder comment), so
  // the mount seed alone would leave a text-filter deep link on the Select
  // tab. Only the 0→n transition switches — removing the last text filter
  // or picking a tab by hand is never overridden.
  const [prevHasTextFilters, setPrevHasTextFilters] = useState(hasTextFilters);
  if (hasTextFilters !== prevHasTextFilters) {
    setPrevHasTextFilters(hasTextFilters);
    if (hasTextFilters) setFilterMode("text");
  }

  // Switching modes is NON-destructive: the other mode's applied filters stay
  // until the user applies something in the new mode — the state hook already
  // enforces select/text mutual exclusivity at apply time (updateFilter drops
  // the column's text filters, addTextFilter drops its checkbox filters).
  // Clearing on the tab click itself deleted a shared link's filters one
  // exploratory click after opening it, with no undo.
  const handleModeChange = setFilterMode;

  return (
    <FilterAccordionItem
      label={label}
      tooltip={tooltip}
      help={help}
      summary={summary}
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

        {/* SELECT MODE: checkboxes with optional counts */}
        {filterMode === "select" && (
          <CategoricalSelectContent
            filterKey={filterKey}
            loading={loading}
            options={options}
            counts={counts}
            displayByValue={displayByValue}
            value={value}
            onChange={onChange}
            onOnlyChange={onOnlyChange}
            renderIcon={renderIcon}
            operator={operator}
            onOperatorChange={onOperatorChange}
          />
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

// Select-mode body of a categorical facet. A separate stateful child so its
// transient list UI state (value search, "show more") lives inside the
// accordion content and unmounts — and therefore resets — when the facet is
// collapsed (Radix unmounts closed content), instead of a reset effect in
// the always-mounted facet wrapper.
function CategoricalSelectContent({
  filterKey,
  loading,
  options,
  counts,
  displayByValue,
  value,
  onChange,
  onOnlyChange,
  renderIcon,
  operator,
  onOperatorChange,
}: Pick<
  CategoricalFacetProps,
  | "filterKey"
  | "loading"
  | "options"
  | "counts"
  | "displayByValue"
  | "value"
  | "onChange"
  | "onOnlyChange"
  | "renderIcon"
  | "operator"
  | "onOperatorChange"
>) {
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { tableName = "data" } = useContext(ControlsContext) ?? {};

  const MAX_VISIBLE_OPTIONS = 12;
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
  // value sits far down a long list (LFE-10494). The rows carrying the
  // applied filter are the CHECKED values for a positive selection, but the
  // UNCHECKED (excluded) values for a `none of` filter: under the
  // checked=kept display model the checked set is the complement of the
  // exclusions (LFE-10717), and pinning that complement would sink the
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
  const pinApplied =
    hasMoreOptions &&
    value.length > 0 &&
    value.length < visibleOptionValues.length;
  const orderedOptions = pinApplied
    ? [
        ...filteredOptions.filter((option) => pinnedSet.has(option)),
        ...filteredOptions.filter((option) => !pinnedSet.has(option)),
      ]
    : filteredOptions;

  const hasMoreFilteredOptions = orderedOptions.length > MAX_VISIBLE_OPTIONS;
  const visibleOptions = showAll
    ? orderedOptions
    : orderedOptions.slice(0, MAX_VISIBLE_OPTIONS);

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
        id={`${filterKey}-${option}`}
        label={displayLabel}
        icon={renderIcon?.(option)}
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
    <div className="px-2">
      {/* Any of / All of / None of operator toggle for arrayOptions filters

          This toggle appears for multi-valued array columns (arrayOptions)
          like tags. It switches between the supported array matching modes:
          - Any of: match items with ANY selected value (OR logic)
          - All of: match items with ALL selected values (AND logic)
          - None of: exclude items carrying any UNCHECKED value (the filter
            stores the exclusions; checkboxes show the kept complement,
            LFE-10717)

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
        <div className="mb-2 px-2">
          <Tabs
            value={operator ?? "any of"}
            onValueChange={(newOperator) =>
              onOperatorChange(newOperator as "any of" | "all of" | "none of")
            }
          >
            <TabsList className="grid h-6 w-full grid-cols-3 p-0.5">
              <TabsTrigger value="any of" className="h-5 px-1 text-xs">
                Any of
              </TabsTrigger>
              <TabsTrigger value="all of" className="h-5 px-1 text-xs">
                All of
              </TabsTrigger>
              <TabsTrigger value="none of" className="h-5 px-1 text-xs">
                None of
              </TabsTrigger>
            </TabsList>
          </Tabs>
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
      ) : visibleOptionValues.length === 0 ? (
        <div className="text-muted-foreground py-1 text-xs">
          {filterKey === "sessionId" ? (
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
          ) : filterKey === "name" ? (
            <span>No {tableName} names found in the given time range.</span>
          ) : filterKey === "tags" ? (
            <span>
              Tags let you filter {tableName} according to custom categories
              (e.g. feature flags).{" "}
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
                <Search className="text-muted-foreground absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
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
              {hasMoreFilteredOptions && !showAll && (
                <div className="px-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAll(true)}
                    className="mt-1 h-auto w-full justify-start py-1 pl-7 text-xs"
                  >
                    Show more values
                  </Button>
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

export function NumericFacet({
  label,
  tooltip,
  help,
  summary,
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
  // Adopt external value changes (reset, URL navigation) during render — the
  // "adjust state when a prop changes" pattern — rather than via a mirror
  // effect. `lastValue` tracks the last adopted prop so pending local edits
  // (which lead the prop while the debounce runs) survive unrelated renders.
  const [lastValue, setLastValue] = useState<[number, number]>(value);
  if (lastValue[0] !== value[0] || lastValue[1] !== value[1]) {
    setLastValue(value);
    setLocalValue(value);
  }
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      tooltip={tooltip}
      help={help}
      summary={summary}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      onReset={onReset}
    >
      <div className="px-4 py-2">
        {loading ? (
          <div className="text-muted-foreground text-sm">Loading...</div>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-center gap-4">
              <div className="grid w-full gap-1.5">
                <Label
                  htmlFor={`min-${filterKey}`}
                  className="text-muted-foreground text-xs"
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
                    <span className="text-muted-foreground text-xs">
                      {unit}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid w-full gap-1.5">
                <Label
                  htmlFor={`max-${filterKey}`}
                  className="text-muted-foreground text-xs"
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
                    <span className="text-muted-foreground text-xs">
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
  tooltip,
  help,
  summary,
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
  // Same render-time adoption as NumericFacet above (no mirror effect).
  const [lastValue, setLastValue] = useState<string>(value);
  if (lastValue !== value) {
    setLastValue(value);
    setLocalValue(value);
  }
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      tooltip={tooltip}
      help={help}
      summary={summary}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      onReset={onReset}
    >
      <div className="px-4">
        {loading ? (
          <div className="text-muted-foreground text-sm">Loading...</div>
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
  tooltip,
  help,
  summary,
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
      tooltip={tooltip}
      help={help}
      summary={summary}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      onReset={onReset}
    >
      {loading ? (
        <div className="text-muted-foreground px-4 py-2 text-sm">
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
  tooltip,
  help,
  summary,
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
      tooltip={tooltip}
      help={help}
      summary={summary}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      onReset={onReset}
    >
      {loading ? (
        <div className="text-muted-foreground px-4 py-2 text-sm">
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

export function BooleanKeyValueFacet({
  label,
  tooltip,
  help,
  summary,
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
}: BooleanKeyValueFacetProps) {
  return (
    <FilterAccordionItem
      label={label}
      tooltip={tooltip}
      help={help}
      summary={summary}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      onReset={onReset}
    >
      {loading ? (
        <div className="text-muted-foreground px-4 py-2 text-sm">
          Loading...
        </div>
      ) : (
        <KeyValueFilterBuilder
          mode="boolean"
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
  tooltip,
  help,
  summary,
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
      tooltip={tooltip}
      help={help}
      summary={summary}
      filterKey={filterKey}
      filterKeyShort={filterKeyShort}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      onReset={onReset}
    >
      {loading ? (
        <div className="text-muted-foreground px-4 py-2 text-sm">
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

// Filter mode tabs for switching between Select (checkboxes) and Text (contains) modes
interface FilterModeTabsProps {
  mode: "select" | "text";
  onModeChange: (mode: "select" | "text") => void;
}

function FilterModeTabs({ mode, onModeChange }: FilterModeTabsProps) {
  return (
    <div className="mb-2 px-4">
      <Tabs
        value={mode}
        onValueChange={(newMode) => onModeChange(newMode as "select" | "text")}
      >
        <TabsList className="grid h-6 w-full grid-cols-2 p-0.5">
          <TabsTrigger value="select" className="h-5 px-2 text-xs">
            Select
          </TabsTrigger>
          <TabsTrigger value="text" className="h-5 px-2 text-xs">
            Text
          </TabsTrigger>
        </TabsList>
      </Tabs>
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
      {/* Operator picker */}
      <div className="px-2">
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
              className="group/textfilter border-border/40 bg-muted/30 flex items-center gap-2 rounded border px-2 py-1 text-xs"
            >
              <span className="text-muted-foreground shrink-0 text-[10px] font-medium">
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
  icon?: React.ReactNode;
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
  icon,
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
      <div className="group/checkbox hover:bg-accent flex items-center rounded-sm p-1 transition-colors">
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
          "group/label hover:bg-accent flex min-w-0 flex-1 cursor-pointer items-center rounded-sm px-1 py-1 transition-colors",
          disabled && "pointer-events-none",
        )}
        onClick={onLabelClick}
      >
        {icon ? <span className="mr-2">{icon}</span> : null}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-xs",
            label === "" && "text-muted-foreground italic",
          )}
          title={displayTitle}
        >
          {displayLabel}
        </span>

        {/* "Only" or "All" indicator when hovering label */}
        {onLabelClick && !disabled && (
          <span className="text-muted-foreground hidden pl-1 text-xs group-hover/label:block">
            {labelText}
          </span>
        )}

        {count > 0 ? (
          <span className="text-muted-foreground ml-auto w-7 pl-1 text-right text-xs">
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
      <h3 className="text-foreground text-sm font-medium">{title}</h3>
      <div>{children}</div>
    </div>
  );
}
