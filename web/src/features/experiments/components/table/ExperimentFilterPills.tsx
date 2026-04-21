import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { ListFilter, ChevronsUpDown, X, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { type FilterCondition, type FilterState } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";

interface ExperimentFilterPillsProps {
  filtersByExperiment: { runId: string; filters: FilterState }[];
  selectedExperimentNames: { experimentId: string; experimentName: string }[];
  onFilterTargetChange: (
    fromExperimentId: string,
    toExperimentId: string,
    filter: FilterCondition,
    filterIndex: number,
  ) => void;
  onFilterRemove: (experimentId: string, filterIndex: number) => void;
  className?: string;
}

function operatorToText(operator: FilterCondition["operator"]): string {
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
  experimentId: string;
  experimentName: string;
  selectedExperimentNames: { experimentId: string; experimentName: string }[];
  onTargetChange: (toExperimentId: string) => void;
  onRemove: () => void;
}

function FilterPillWithTarget({
  filter,
  experimentId,
  experimentName,
  selectedExperimentNames,
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
            {selectedExperimentNames.map((exp) => (
              <button
                key={exp.experimentId}
                onClick={() => {
                  if (exp.experimentId !== experimentId) {
                    onTargetChange(exp.experimentId);
                  }
                  setOpen(false);
                }}
                className={cn(
                  "hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                  exp.experimentId === experimentId && "bg-muted",
                )}
              >
                <div className="flex h-4 w-4 items-center justify-center">
                  {exp.experimentId === experimentId && (
                    <Check className="text-primary h-3 w-3" />
                  )}
                </div>
                <span className="truncate" title={exp.experimentName}>
                  {exp.experimentName}
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
  filtersByExperiment,
  selectedExperimentNames,
  onFilterTargetChange,
  onFilterRemove,
  className,
}: ExperimentFilterPillsProps) {
  // Flatten all filters with their associated experiment information
  const allFilters = useMemo(() => {
    return filtersByExperiment.flatMap((expFilter) =>
      expFilter.filters.map((filter, index) => ({
        filter,
        filterIndex: index,
        experimentId: expFilter.runId,
        experimentName:
          selectedExperimentNames.find(
            (exp) => exp.experimentId === expFilter.runId,
          )?.experimentName ?? expFilter.runId,
        key: `${expFilter.runId}-${index}`,
      })),
    );
  }, [filtersByExperiment, selectedExperimentNames]);

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
          experimentId={item.experimentId}
          experimentName={item.experimentName}
          selectedExperimentNames={selectedExperimentNames}
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
