import { type AgentSessionProjection } from "@langfuse/shared";
import { AgentComparisonSparkline } from "../overview/AgentComparisonSparkline";
import { useAgentAppearance } from "../appearance";
import { AgentComparisonView } from "./AgentComparisonView";

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
  return (
    <div className="mx-4 mb-2">
      <AgentComparisonView
        agent={agent ?? null}
        recentWindow={projection.recentWindow}
        baselineWindow={projection.baselineWindow}
        chart={
          agent ? (
            <AgentComparisonSparkline
              agent={agent}
              projection={projection}
              color={appearance.color}
            />
          ) : null
        }
        onSelectSignal={onSelectSignal}
      />
    </div>
  );
}
