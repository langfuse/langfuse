import type { AgentSetupContext } from "@/src/features/ai-gateway/types/agentSetupInstructions";
import { buildApiInstructions } from "./buildApiInstructions";
import { buildClaudeCodeInstructions } from "./buildClaudeCodeInstructions";
import { buildClaudeDesktopInstructions } from "./buildClaudeDesktopInstructions";
import { buildCodexInstructions } from "./buildCodexInstructions";
import { buildCopilotCliInstructions } from "./buildCopilotCliInstructions";
import { buildCopilotDesktopInstructions } from "./buildCopilotDesktopInstructions";
import { buildOpenCodeInstructions } from "./buildOpenCodeInstructions";

/** One entry per tool in the "Gateway key created" dialog. */
export function buildAgentSetupInstructions(context: AgentSetupContext) {
  return [
    buildApiInstructions(context),
    buildClaudeCodeInstructions(context),
    buildClaudeDesktopInstructions(context),
    buildCodexInstructions(context),
    buildOpenCodeInstructions(context),
    buildCopilotCliInstructions(context),
    buildCopilotDesktopInstructions(context),
  ];
}
