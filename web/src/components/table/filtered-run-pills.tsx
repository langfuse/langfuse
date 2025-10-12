import { Badge } from "@/src/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { api } from "@/src/utils/api";
import { ListFilter } from "lucide-react";
import React, { useMemo } from "react";
import { type FilterCondition, type FilterState } from "@langfuse/shared";

interface FilteredRunPillsProps {
  projectId: string;
  datasetId: string;
  filteredRuns: {
    runId: string;
    filters: FilterState;
  }[];
  className?: string;
}

function operatorToText(operator: FilterCondition["operator"]): string {
  switch (operator) {
    case "=":
      return "equals";
    case ">=":
      return "greater than or equal to";
    case "<=":
      return "less than or equal to";
    case ">":
      return "greater than";
    case "<":
      return "less than";
  }
  return operator;
}

// Helper function to format filter information for display
function formatFilterForPill(filter: FilterCondition) {
  const { operator, value } = filter;

  // Handle score filters (numberObject and categoryOptions with key)
  if (filter.type === "numberObject") {
    const valueStr = Array.isArray(value) ? value.join(", ") : String(value);
    return `${filter.key} ${operatorToText(operator)} ${valueStr}`;
  }

  if (filter.type === "categoryOptions") {
    const valueStr = Array.isArray(value) ? value.join(", ") : String(value);
    return `${filter.key} ${operatorToText(operator)} ${valueStr}`;
  }

  // Fallback for other filter types
  const valueStr = Array.isArray(value) ? value.join(", ") : String(value);
  return `${filter.column} ${operatorToText(operator)} ${valueStr}`;
}

export function FilteredRunPills({
  projectId,
  datasetId,
  filteredRuns,
  className,
}: FilteredRunPillsProps) {
  // Get run names from the API
  const { data: runs } = api.datasets.baseRunDataByDatasetId.useQuery({
    projectId,
    datasetId,
  });

  // Create a map of run ID to run name for quick lookup
  const runIdToName = useMemo(() => {
    if (!runs) return new Map<string, string>();
    return new Map(runs.map((run) => [run.id, run.name]));
  }, [runs]);

  // Flatten all filters with their associated run information
  const allFilters = filteredRuns.flatMap((runFilter) =>
    runFilter.filters.map((filter, index) => ({
      filter,
      runId: runFilter.runId,
      runName: runIdToName.get(runFilter.runId) ?? runFilter.runId,
      key: `${runFilter.runId}-${index}`,
    })),
  );

  if (allFilters.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className ?? ""}`}>
      {allFilters.map((item) => {
        return (
          <HoverCard key={item.key}>
            <HoverCardTrigger asChild>
              <Badge
                variant="secondary"
                className="cursor-pointer text-xs transition-colors hover:bg-secondary/80"
              >
                <ListFilter className="mr-1 h-3 w-3" />
                <div className="font-normal">
                  {formatFilterForPill(item.filter)}
                </div>
              </Badge>
            </HoverCardTrigger>
            <HoverCardContent className="w-64">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  {item.runName}
                </div>
                <div className="space-y-1">
                  <div className="rounded-md bg-muted px-2 py-1 text-sm">
                    {formatFilterForPill(item.filter)}
                  </div>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </div>
  );
}
