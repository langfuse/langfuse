import {
  type FilterState,
  type StudioQuery,
  type StudioWidgetConfig,
} from "@langfuse/shared";
import { PlusIcon, BracesIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { formatFilterPreview } from "@/src/components/table/table-view-presets/lib/viewPreview";
import { readableField } from "./catalog";
import { StudioSeriesEditor } from "./StudioSeriesEditor";
import { StudioFormulaEditor } from "./StudioFormulaEditor";

export function StudioQueryWorkspace({
  config,
  projectId,
  isV4,
  dateRange,
  filterState,
  environmentOverrides,
  invalidQueryIds,
  onFilterValidityChange,
  onDefaultQueryIdsChange,
  onQueryChange,
  onQueryRemove,
  onQueryDuplicate,
  onQueryAdd,
  onFormulaChange,
  onFormulaRemove,
  onFormulaAdd,
}: StudioQueryWorkspaceProps) {
  const references = config.queries.flatMap((query) =>
    query.metrics.map((metric) => `${query.id}.${metric.id}`),
  );
  const activeIds = config.display.activeQueryIds;
  const defaultView = (() => {
    if (activeIds?.length === 1) return `query:${activeIds[0]}`;
    if (activeIds?.length) return "configured";
    return "all";
  })();
  return (
    <section
      aria-label="Query workspace"
      className="bg-muted/20 flex h-full min-h-0 min-w-0 flex-col"
    >
      <div className="bg-background flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-y px-4 py-1">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 text-sm font-bold">
            Queries{" "}
            <span className="text-muted-foreground ml-1 font-normal">
              {config.queries.length + config.expressions.length}
            </span>
          </h2>
          {config.queries.length > 1 ? (
            <label className="flex min-w-0 items-center gap-2 text-xs">
              <span className="text-muted-foreground shrink-0">
                Default view
              </span>
              <div className="w-40 min-w-0">
                <SelectInput
                  noCapture
                  aria-label="Default view"
                  placeholder="All queries"
                  value={defaultView}
                  options={[
                    ...(defaultView === "configured"
                      ? [{ value: "configured", label: "Selected queries" }]
                      : []),
                    { value: "all", label: "All queries" },
                    ...config.queries.map((query) => ({
                      value: `query:${query.id}`,
                      label: query.label || query.id,
                    })),
                  ]}
                  onValueChange={(value) => {
                    if (value === defaultView) return;
                    onDefaultQueryIdsChange(
                      value === "all" ? undefined : [value.slice(6)],
                    );
                  }}
                />
              </div>
            </label>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {config.queries.length < 8 ? (
            <Button
              text="Add query"
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
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div
          className="ph-no-capture text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
          aria-label="Dashboard scope"
        >
          <span>
            {dateRange.from.toLocaleDateString()} –{" "}
            {dateRange.to.toLocaleDateString()}
          </span>
          {!filterState.length ? (
            <span>No dashboard filters</span>
          ) : (
            <span>Dashboard filters:</span>
          )}
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
        {environmentOverrides.length ? (
          <p className="ph-no-capture text-muted-foreground text-xs">
            Query environment filters override the dashboard environment for{" "}
            {environmentOverrides.join(", ")}.
          </p>
        ) : null}
        {config.queries.map((query) => (
          <StudioSeriesEditor
            key={query.id}
            query={query}
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
              config.queries.length < 8
                ? () => onQueryDuplicate(query)
                : undefined
            }
          />
        ))}
        {config.expressions.map((expression, index) => (
          <StudioFormulaEditor
            key={expression.id}
            expression={expression}
            references={[
              ...references,
              ...config.expressions.slice(0, index).map((item) => item.id),
            ]}
            onChange={onFormulaChange}
            onRemove={() => onFormulaRemove(expression.id)}
          />
        ))}
      </div>
    </section>
  );
}

type StudioQueryWorkspaceProps = {
  config: StudioWidgetConfig;
  projectId: string;
  isV4: boolean;
  dateRange: { from: Date; to: Date };
  filterState: FilterState;
  environmentOverrides: string[];
  invalidQueryIds: string[];
  onFilterValidityChange: (id: string, valid: boolean) => void;
  onDefaultQueryIdsChange: (ids: string[] | undefined) => void;
  onQueryChange: (id: string, query: StudioQuery) => void;
  onQueryRemove: (id: string) => void;
  onQueryDuplicate: (query: StudioQuery) => void;
  onQueryAdd: () => void;
  onFormulaChange: (
    expression: StudioWidgetConfig["expressions"][number],
  ) => void;
  onFormulaRemove: (id: string) => void;
  onFormulaAdd: () => void;
};
