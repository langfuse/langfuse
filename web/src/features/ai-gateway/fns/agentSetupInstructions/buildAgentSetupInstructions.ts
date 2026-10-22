import type { AgentSetupContext } from "@/src/features/ai-gateway/types/agentSetupInstructions";
import { buildApiInstructions } from "./buildApiInstructions";
import { buildClaudeCodeInstructions } from "./buildClaudeCodeInstructions";
import { buildCodexInstructions } from "./buildCodexInstructions";
import { buildOpenCodeInstructions } from "./buildOpenCodeInstructions";

/** Tab order of the "Gateway key created" dialog. */
export function buildAgentSetupInstructions(context: AgentSetupContext) {
  return [
    buildApiInstructions(context),
    buildClaudeCodeInstructions(context),
    buildCodexInstructions(context),
    buildOpenCodeInstructions(context),
  ];
}
