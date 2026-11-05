import { RefreshCw } from "@langfuse/icons";
import { type AgentScope } from "@langfuse/shared/agents";
import { TimeRangePicker } from "@/src/components/date-picker";
import { Button } from "@/src/components/design-system/Button/Button";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { type TimeRange } from "@/src/utils/date-range-utils";
import { useAgentEnvironments } from "../hooks/useAgentQueries";

export function AgentScopeControls({
  scope,
  enabled,
  error,
  setEnvironment,
  setTimeRange,
  refresh,
  refreshing,
}: {
  scope: AgentScope;
  enabled: boolean;
  error: string | null;
  setEnvironment: (environment: string | null) => void;
  setTimeRange: (range: TimeRange) => void;
  refresh: () => void;
  refreshing: boolean;
}) {
  const environments = useAgentEnvironments(
    { projectId: scope.projectId, from: scope.from, to: scope.to },
    enabled,
  );
  const values = [
    ...new Set([
      ...(environments.data ?? []),
      ...(scope.environment === null ? [] : [scope.environment]),
    ]),
  ].filter((value) => value.trim().length > 0);
  return (
    <div className="shrink-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <div className="w-56">
          <SelectInput
            noCapture
            aria-label="Environment"
            value={
              scope.environment === null ? "all" : `env:${scope.environment}`
            }
            onValueChange={(value) =>
              setEnvironment(value === "all" ? null : value.slice(4))
            }
            options={[
              { value: "all", label: "All environments" },
              ...values.map((value) => ({
                value: `env:${value}`,
                label: value,
              })),
            ]}
            placeholder="All environments"
            search={{ placeholder: "Find an environment" }}
          />
        </div>
        <TimeRangePicker
          timeRange={{ from: scope.from, to: scope.to }}
          onTimeRangeChange={setTimeRange}
          timeRangePresets={[
            "last1Hour",
            "last1Day",
            "last7Days",
            "last30Days",
          ]}
        />
        <Button
          text="Refresh"
          icon={RefreshCw}
          variant="secondary"
          onClick={refresh}
          loading={refreshing}
        />
        {environments.isError && (
          <span className="text-muted-foreground text-xs">
            Environment options unavailable. Current selection is retained.
          </span>
        )}
      </div>
      {error && (
        <div className="px-4 pb-3">
          <Alert variant="warning">
            <Alert.Description>{error}</Alert.Description>
          </Alert>
        </div>
      )}
    </div>
  );
}
