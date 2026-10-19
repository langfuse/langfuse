import { AgentGlyph } from "./AgentGlyph";
import { useAgentAppearance } from "./appearanceStore";

export function AgentIdentity({
  projectId,
  agentName,
  size = "md",
  showName = true,
}: {
  projectId: string;
  agentName: string;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
}) {
  const appearance = useAgentAppearance(projectId, agentName);
  return (
    <span
      className="ph-no-capture inline-flex min-w-0 items-center gap-2"
      aria-label={agentName}
    >
      <AgentGlyph appearance={appearance} size={size} />
      {showName && (
        <span className="truncate" title={agentName}>
          {agentName}
        </span>
      )}
    </span>
  );
}
