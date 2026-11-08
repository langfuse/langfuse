import { type AgentDetailInput } from "@langfuse/shared/agents";
import { api } from "@/src/utils/api";
import { useAgentActivityDrill } from "../hooks/useAgentActivityDrill";
import { toAgentActivityState } from "../lib/agentActivity";
import { AgentActivityPulse } from "./AgentActivityPulse";

export function AgentSkillsActivityPulse({
  input,
}: {
  input: AgentDetailInput;
}) {
  const query = api.agents.skillsActivity.useQuery({
    ...input,
    bucketCount: 100,
  });
  const drill = useAgentActivityDrill(input, "agent_skills");

  return (
    <AgentActivityPulse
      activity={toAgentActivityState(query)}
      label="Skill loads"
      description="Recorded skill resource loads for this agent and environment in each time bucket. Loads do not measure effectiveness."
      onSelectRange={drill}
    />
  );
}
