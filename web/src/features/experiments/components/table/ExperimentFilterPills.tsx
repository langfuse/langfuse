import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { api } from "@/src/utils/api";
import { ListFilter, ChevronsUpDown, X, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { type FilterCondition, type FilterState } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";

export type ExperimentOption = {
  id: string;
  name: string;
};

interface ExperimentFilterPillsProps {
  projectId: string;
  // All filters grouped by experiment
  filtersByExperiment: { runId: string; filters: FilterState }[];
  // Available experiments to target (baseline + comparisons)
  availableExperiments: ExperimentOption[];
  // Callback when filter target changes
  onFilterTargetChange: (
    fromExperimentId: string,
    toExperimentId: string,
    filter: FilterCondition,
    filterIndex: number,
  ) => void;
  // Callback to remove filter
  onFilterRemove: (experimentId: string, filterIndex: number) => void;
  className?: string;
}

function operatorToText(operator: FilterCondition["operator"]): string {
  switch (operator) {
    case "=":
      return "=";
    case ">=":
      return "≥";
    case "<=":
      return "≤";
    case ">":
      return ">";
    case "<":
      return "<";
    case "any of":
      return "∈";
    case "none of":
      return "∉";
    case "all of":
      return "⊇";
    case "contains":
      return "contains";
    case "does not contain":
      return "!contains";
    case "starts with":
      return "starts";
    case "ends with":
      return "ends";
  }
  return String(operator);
}

function formatFilterForPill(filter: FilterCondition): string {
  const { column, operator, value } = filter;

  // Handle object filters (numberObject, stringObject) with key
  if (
    (filter.type === "numberObject" || filter.type === "stringObject") &&
    "key" in filter
  ) {
    const valueStr = Array.isArray(value) ? value.join(", ") : String(value);
    return `${filter.key} ${operatorToText(operator)} ${valueStr}`;
  }

  // Handle category options with key
  if (filter.type === "categoryOptions" && "key" in filter) {
    const valueStr = Array.isArray(value) ? value.join(", ") : String(value);
    return `${filter.key} ${operatorToText(operator)} ${valueStr}`;
  }

  // Handle array values
  if (Array.isArray(value)) {
    const valueStr =
      value.length > 2
        ? `${value.slice(0, 2).join(", ")}...`
        : value.join(", ");
    return `${column} ${operatorToText(operator)} ${valueStr}`;
  }

  // Handle simple values
  const valueStr = String(value);
  const displayValue =
    valueStr.length > 20 ? valueStr.slice(0, 20) + "..." : valueStr;
  return `${column} ${operatorToText(operator)} ${displayValue}`;
}

interface FilterPillWithTargetProps {
  filter: FilterCondition;
  filterIndex: number;
  experimentId: string;
  experimentName: string;
  availableExperiments: ExperimentOption[];
  onTargetChange: (toExperimentId: string) => void;
  onRemove: () => void;
}

function FilterPillWithTarget({
  filter,
  experimentId,
  experimentName,
  availableExperiments,
  onTargetChange,
  onRemove,
}: FilterPillWithTargetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Badge
      variant="secondary"
      className="flex max-w-full items-center gap-1 px-2 py-1 text-xs"
    >
      <ListFilter className="h-3 w-3 shrink-0" />
      <span className="truncate" title={formatFilterForPill(filter)}>
        {formatFilterForPill(filter)}
      </span>
      <span className="text-muted-foreground shrink-0">→</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="flex shrink-0 items-center gap-0.5 font-medium hover:underline"
            title={experimentName}
          >
            <span className="max-w-[100px] truncate">{experimentName}</span>
            <ChevronsUpDown className="h-3 w-3 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-1" align="start">
          <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
            Target Experiment
          </div>
          <div className="space-y-0.5">
            {availableExperiments.map((exp) => (
              <button
                key={exp.id}
                onClick={() => {
                  if (exp.id !== experimentId) {
                    onTargetChange(exp.id);
                  }
                  setOpen(false);
                }}
                className={cn(
                  "hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                  exp.id === experimentId && "bg-muted",
                )}
              >
                <div className="flex h-4 w-4 items-center justify-center">
                  {exp.id === experimentId && (
                    <Check className="text-primary h-3 w-3" />
                  )}
                </div>
                <span className="truncate" title={exp.name}>
                  {exp.name}
                </span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="sm"
        className="h-4 w-4 shrink-0 p-0 hover:bg-transparent"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="h-3 w-3" />
      </Button>
    </Badge>
  );
}

export function ExperimentFilterPills({
  projectId,
  filtersByExperiment,
  availableExperiments,
  onFilterTargetChange,
  onFilterRemove,
  className,
}: ExperimentFilterPillsProps) {
  // Create a map of experiment ID to name for quick lookup
  const experimentIdToName = useMemo(() => {
    return new Map(availableExperiments.map((exp) => [exp.id, exp.name]));
  }, [availableExperiments]);

  // Flatten all filters with their associated experiment information
  const allFilters = useMemo(() => {
    return filtersByExperiment.flatMap((expFilter) =>
      expFilter.filters.map((filter, index) => ({
        filter,
        filterIndex: index,
        experimentId: expFilter.runId,
        experimentName:
          experimentIdToName.get(expFilter.runId) ?? expFilter.runId,
        key: `${expFilter.runId}-${index}`,
      })),
    );
  }, [filtersByExperiment, experimentIdToName]);

  if (allFilters.length === 0) {
    return null;
  }

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5 px-2 py-2", className)}
    >
      {allFilters.map((item) => (
        <FilterPillWithTarget
          key={item.key}
          filter={item.filter}
          filterIndex={item.filterIndex}
          experimentId={item.experimentId}
          experimentName={item.experimentName}
          availableExperiments={availableExperiments}
          onTargetChange={(toExperimentId) =>
            onFilterTargetChange(
              item.experimentId,
              toExperimentId,
              item.filter,
              item.filterIndex,
            )
          }
          onRemove={() => onFilterRemove(item.experimentId, item.filterIndex)}
        />
      ))}
    </div>
  );
}
