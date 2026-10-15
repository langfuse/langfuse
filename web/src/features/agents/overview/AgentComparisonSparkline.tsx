import {
  type AgentSessionProjection,
  type AgentProjectionSummary,
} from "@langfuse/shared";
import { LineChart } from "@/src/components/design-system/charts/LineChart/LineChart";
import { comparisonSeries } from "./prepareOverview";
export function AgentComparisonSparkline({
  agent,
  projection,
  color,
}: {
  agent: AgentProjectionSummary;
  projection: AgentSessionProjection;
  color: string;
}) {
  const data = comparisonSeries(projection, agent.agentName);
  return (
    <div className="ph-no-capture flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Tool calls / session</span>
        <span className="text-muted-foreground">
          {agent.comparisonStatus === "ready"
            ? "Settled cohorts"
            : agent.comparisonStatus === "incomplete-cohort"
              ? "Incomplete history"
              : "Small sample"}
        </span>
      </div>
      {data.length > 0 ? (
        <div className="h-28">
          <LineChart
            ariaLabel="Trailing average tool calls per session: baseline and recent"
            data={data}
            xAxis={{ type: "category", labels: "hidden" }}
            series={[
              {
                id: "baseline",
                label: "Baseline · trailing 5 sessions",
                color: "#94a3b8",
                lineStyle: "dashed",
              },
              { id: "recent", label: "Recent · trailing 5 sessions", color },
            ]}
            valueFormatter={(value) => value.toFixed(1)}
            legend={{ visibility: "hidden" }}
          />
        </div>
      ) : (
        <div className="text-muted-foreground bg-muted/30 flex h-28 items-center justify-center rounded-md text-xs">
          No complete session cohorts
        </div>
      )}
      <p className="text-muted-foreground text-[10px]">
        Normalized session-cohort progress · trailing 5 sessions
      </p>
      <div className="text-muted-foreground flex justify-between gap-2 text-[11px]">
        <span>
          Baseline {agent.baseline.averageToolsPerSession?.toFixed(1) ?? "—"} ·{" "}
          {agent.baseline.completeSessions} sessions
        </span>
        <span style={{ color }}>
          Recent {agent.recent.averageToolsPerSession?.toFixed(1) ?? "—"} ·{" "}
          {agent.recent.completeSessions}
        </span>
      </div>
    </div>
  );
}
