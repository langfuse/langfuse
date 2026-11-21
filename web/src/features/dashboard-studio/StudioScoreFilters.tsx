import { type FilterState, type StudioQuery } from "@langfuse/shared";
import { useMetricsFilterBuilderData } from "@/src/features/metrics/components/ConnectedMetricsFilterBuilder";
import { MetricsFilterBuilder } from "@/src/features/metrics/components/MetricsFilterBuilder";
import { Button } from "@/src/components/design-system/Button/Button";

const identity = new Set([
  "name",
  "scoreName",
  "configId",
  "source",
  "dataType",
]);
const allowed = new Set([
  "environment",
  "value",
  "stringValue",
  "booleanValue",
  "evaluatorId",
  "isEvaluatorTest",
]);
export function StudioScoreFilters({
  query,
  projectId,
  isV4,
  dateRange,
  onChange,
  onValidityChange,
}: {
  query: StudioQuery;
  projectId: string;
  isV4: boolean;
  dateRange: { from: Date; to: Date };
  onChange: (filters: FilterState) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const data = useMetricsFilterBuilderData({
    projectId,
    view: query.view,
    version: isV4 ? "v2" : "v1",
    dateRange,
    filters: query.filters,
  });
  const preserved = query.filters.filter((item) => identity.has(item.column));
  const filters = query.filters.filter(
    (item) => !identity.has(item.column) && allowed.has(item.column),
  );
  const unsupported = query.filters.filter(
    (item) => !identity.has(item.column) && !allowed.has(item.column),
  );
  return (
    <div className="ph-no-capture flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <span className="text-muted-foreground w-16 shrink-0 pt-2 text-xs">
          Score filters
        </span>
        <div className="min-w-0 flex-1">
          <MetricsFilterBuilder
            {...data}
            columns={data.columns.filter((column) => allowed.has(column.id))}
            view={query.view}
            filters={filters}
            onValidityChange={onValidityChange}
            compact={false}
            onChange={(next) =>
              onChange([...preserved, ...unsupported, ...next])
            }
          />
        </div>
      </div>
      {unsupported.length ? (
        <div className="rounded border p-3 text-xs">
          <p>
            These saved filters need relationship support and cannot be edited
            in the first release:{" "}
            {unsupported.map((item) => item.column).join(", ")}.
          </p>
          <Button
            text="Remove relationship filters"
            variant="text"
            onClick={() => onChange([...preserved, ...filters])}
          />
        </div>
      ) : null}
    </div>
  );
}
