import { type AgentDetailInput } from "@langfuse/shared/agents";
import SessionsTable from "@/src/features/sessions/SessionsTable";

export function AgentSessionsTable({ input }: { input: AgentDetailInput }) {
  const { projectId, ...agentScope } = input;
  return (
    <div className="flex min-h-48 flex-1 flex-col">
      <p className="text-muted-foreground shrink-0 px-4 py-2 text-xs">
        Sessions containing this agent, with totals across all participating
        agents.
      </p>
      <div className="min-h-0 flex-1">
        <SessionsTable
          projectId={projectId}
          agentScope={agentScope}
          isV4
          showControlsInPageHeader
        />
      </div>
    </div>
  );
}
