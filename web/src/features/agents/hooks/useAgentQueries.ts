import {
  type AgentDetailInput,
  type AgentListInput,
  type AgentPageInput,
  type AgentScope,
} from "@langfuse/shared/agents";
import { api } from "@/src/utils/api";

export function useAgentList(input: AgentListInput, enabled: boolean) {
  return api.agents.list.useQuery(input, { enabled });
}

export function useAgentDetail(input: AgentDetailInput, enabled: boolean) {
  return api.agents.detail.useQuery(input, { enabled });
}

export function useAgentRuns(input: AgentDetailInput & AgentPageInput) {
  return api.agents.runs.useQuery(input);
}

export function useAgentTraces(input: AgentDetailInput & AgentPageInput) {
  return api.agents.traces.useQuery(input);
}

export function useAgentSkills(input: AgentDetailInput & AgentPageInput) {
  return api.agents.skills.useQuery(input);
}

export function useAgentInfo(input: AgentDetailInput) {
  return api.agents.info.useQuery(input);
}

export function useAgentEnvironments(
  scope: Pick<AgentScope, "projectId" | "from" | "to">,
  enabled: boolean,
) {
  return api.agents.environments.useQuery(scope, { enabled });
}
