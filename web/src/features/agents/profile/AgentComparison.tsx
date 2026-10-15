import { type AgentSessionProjection } from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { numberFormatter } from "@/src/utils/numbers";
import { AgentComparisonSparkline } from "../overview/AgentComparisonSparkline";
import { useAgentAppearance } from "../appearance";

const rangeLabel = (from: Date, to: Date) =>
  `${from.toLocaleString()} – ${to.toLocaleString()}`;
const meanLabel = (value: number | null) =>
  value === null ? "—" : numberFormatter(value, 1);

export function AgentComparison({
  agentName,
  projection,
  onSelectSignal,
  projectId,
}: {
  agentName: string;
  projection: AgentSessionProjection;
  onSelectSignal: (kind: string) => void;
  projectId: string;
}) {
  const appearance = useAgentAppearance(projectId, agentName);
  const agent = projection.agents.find((item) => item.agentName === agentName);
  const ready = agent?.comparisonStatus === "ready";
  const statusLabel = {
    ready: "Historical comparison",
    "incomplete-cohort": "Incomplete cohort",
    "insufficient-data": "Insufficient sessions",
  }[agent?.comparisonStatus ?? "insufficient-data"];
  return (
    <div className="mx-4 mb-4 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold">Tools per session</h2>
        <Badge color={ready ? "filled" : "yellow"} text={statusLabel} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-lg">
              {meanLabel(agent?.recent.averageToolsPerSession ?? null)}
            </span>
            <span className="text-muted-foreground text-xs">
              recent · {agent?.recent.completeSessions ?? 0} qualifying sessions
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {rangeLabel(
              projection.recentWindow.from,
              projection.recentWindow.to,
            )}
          </p>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground font-mono text-lg">
              {meanLabel(agent?.baseline.averageToolsPerSession ?? null)}
            </span>
            <span className="text-muted-foreground text-xs">
              baseline · {agent?.baseline.completeSessions ?? 0} qualifying
              sessions
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {rangeLabel(
              projection.baselineWindow.from,
              projection.baselineWindow.to,
            )}
          </p>
        </div>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Includes zero-tool sessions. Comparisons use settled observed sessions;
        a change is a prompt to investigate, not a quality score. Times use your
        browser&apos;s timezone.
      </p>
      {(agent?.excludedSessions ?? 0) > 0 && (
        <p className="text-muted-foreground mt-1 text-xs">
          {agent?.excludedSessions} open or incomplete session contexts excluded
          from comparisons.
        </p>
      )}
      {agent && (
        <div className="mt-3">
          <AgentComparisonSparkline
            agent={agent}
            projection={projection}
            color={appearance.color}
          />
        </div>
      )}
      {agent && agent.signals.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {agent.signals.map((signal) => (
            <div
              key={signal.kind}
              className="bg-muted/40 flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
            >
              <span>{signal.message}</span>
              <Button
                text="Inspect sessions"
                variant="text"
                onClick={() => onSelectSignal(signal.kind)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
