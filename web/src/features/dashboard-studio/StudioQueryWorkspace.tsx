import {
  type FilterState,
  type StudioQuery,
  type StudioWidgetConfig,
} from "@langfuse/shared";
import { useState } from "react";
import { PlusIcon, BracesIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { formatFilterPreview } from "@/src/components/table/table-view-presets/lib/viewPreview";
import { readableField } from "./catalog";
import { StudioSeriesEditor } from "./StudioSeriesEditor";
import { StudioFormulaEditor } from "./StudioFormulaEditor";
import {
  createStudioFormulaOperands,
  getStudioFormulaOnlyVisibility,
  getStudioSeriesVisibility,
  studioSeriesLetter,
  type StudioSeriesVisibility,
} from "./studioFormulaAuthoring";

export function StudioQueryWorkspace({
  config,
  expandedId,
  onExpand,
  executionMode,
  projectId,
  isV4,
  dateRange,
  filterState,
  environmentOverrides,
  invalidQueryIds,
  onFilterValidityChange,
  onQueryChange,
  onQueryRemove,
  onQueryDuplicate,
  onQueryAdd,
  onFormulaChange,
  onFormulaRemove,
  onFormulaAdd,
  onSeriesVisibilityChange,
  onFormulaCommit,
}: StudioQueryWorkspaceProps) {
  const queryLimit = executionMode === "current" ? 5 : 8;
  const [isolated, setIsolated] = useState<{
    id: string;
    previous: StudioSeriesVisibility;
  } | null>(null);
  return (
    <section
      aria-label="Query workspace"
      className="bg-background flex h-full min-h-0 min-w-0 flex-col"
    >
      <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 px-4 pt-2">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 text-sm font-bold">
            Series{" "}
            <span className="text-muted-foreground ml-1 font-normal">
              {config.queries.length + config.expressions.length}
            </span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {config.queries.length < queryLimit ? (
            <Button
              text="Add series"
              icon={PlusIcon}
              variant="ghost"
              size="sm"
              onClick={onQueryAdd}
            />
          ) : null}
          {config.expressions.length < 8 ? (
            <Button
              text="Add formula"
              icon={BracesIcon}
              variant="ghost"
              size="sm"
              onClick={onFormulaAdd}
            />
          ) : null}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pt-2 pb-6">
        {filterState.length ? (
          <div
            className="ph-no-capture text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
            aria-label="Dashboard scope"
          >
            <span>Dashboard filters:</span>
            {filterState.map((filter, index) => (
              <span
                key={index}
                className="bg-background text-foreground-secondary max-w-full rounded border px-2 py-0.5 break-words whitespace-pre-wrap"
              >
                {formatFilterPreview({
                  ...filter,
                  column: readableField(filter.column),
                })}
              </span>
            ))}
          </div>
        ) : null}
        {environmentOverrides.length ? (
          <p className="ph-no-capture text-muted-foreground text-xs">
            Query environment filters override the dashboard environment for{" "}
            {environmentOverrides.join(", ")}.
          </p>
        ) : null}
        {config.queries.map((query, index) => (
          <StudioSeriesEditor
            key={query.id}
            query={query}
            letter={studioSeriesLetter(index)}
            expanded={expandedId === query.id}
            onExpandedChange={(expanded) =>
              onExpand(expanded ? query.id : null)
            }
            executionMode={executionMode}
            isV4={isV4}
            timeSeries={
              config.display.timeSeries ??
              config.display.chartType.endsWith("TIME_SERIES")
            }
            projectId={projectId}
            dateRange={dateRange}
            filtersValid={!invalidQueryIds.includes(query.id)}
            onFilterValidityChange={(valid) =>
              onFilterValidityChange(query.id, valid)
            }
            onChange={(next) => onQueryChange(query.id, next)}
            onRemove={
              config.queries.length > 1
                ? () => onQueryRemove(query.id)
                : undefined
            }
            onDuplicate={
              config.queries.length < queryLimit
                ? () => onQueryDuplicate(query)
                : undefined
            }
          />
        ))}
        {config.expressions.map((expression, index) => (
          <StudioFormulaEditor
            key={expression.id}
            expression={expression}
            operands={createStudioFormulaOperands(
              config.queries,
              config.expressions.slice(0, index),
              isV4,
            )}
            letter={studioSeriesLetter(config.queries.length + index)}
            expanded={expandedId === expression.id}
            onExpandedChange={(expanded) =>
              onExpand(expanded ? expression.id : null)
            }
            onChange={onFormulaChange}
            onCommit={() => onFormulaCommit(expression.id)}
            isolationActive={isolated?.id === expression.id}
            onIsolationChange={() => {
              if (isolated?.id === expression.id) {
                onSeriesVisibilityChange(isolated.previous, "reset");
                setIsolated(null);
              } else {
                setIsolated({
                  id: expression.id,
                  previous: getStudioSeriesVisibility(config),
                });
                onSeriesVisibilityChange(
                  getStudioFormulaOnlyVisibility(config, expression.id),
                  "isolate",
                );
              }
            }}
            onRemove={() => onFormulaRemove(expression.id)}
          />
        ))}
      </div>
    </section>
  );
}

type StudioQueryWorkspaceProps = {
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  executionMode: "current" | "prototype";
  config: StudioWidgetConfig;
  projectId: string;
  isV4: boolean;
  dateRange: { from: Date; to: Date };
  filterState: FilterState;
  environmentOverrides: string[];
  invalidQueryIds: string[];
  onFilterValidityChange: (id: string, valid: boolean) => void;
  onQueryChange: (id: string, query: StudioQuery) => void;
  onQueryRemove: (id: string) => void;
  onQueryDuplicate: (query: StudioQuery) => void;
  onQueryAdd: () => void;
  onFormulaChange: (
    expression: StudioWidgetConfig["expressions"][number],
  ) => void;
  onFormulaRemove: (id: string) => void;
  onFormulaAdd: () => void;
  onSeriesVisibilityChange: (
    visibility: StudioSeriesVisibility,
    interaction: "isolate" | "reset",
  ) => void;
  onFormulaCommit: (id: string) => void;
};
