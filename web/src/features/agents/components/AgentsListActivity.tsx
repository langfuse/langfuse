import { api, type RouterInputs } from "@/src/utils/api";
import { useAgentActivityDrill } from "../hooks/useAgentActivityDrill";
import { toAgentActivityState } from "../lib/agentActivity";
import { AgentActivityPulse } from "./AgentActivityPulse";

export function AgentsListActivity({
  input,
}: {
  input: RouterInputs["agents"]["listActivity"];
}) {
  const activity = api.agents.listActivity.useQuery(input);
  const drill = useAgentActivityDrill(input, "agents");

  return (
    <AgentActivityPulse
      label="Observed activity"
      description="Observed activity from all agents matching these filters."
      activity={toAgentActivityState(activity)}
      onSelectRange={drill}
    />
  );
}
