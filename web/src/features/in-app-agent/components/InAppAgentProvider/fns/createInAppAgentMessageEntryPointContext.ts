import { MESSAGE_ENTRY_POINT_CONTEXT_DESCRIPTION } from "@/src/features/in-app-agent/constants";
import { type InAppAgentMessageEntryPoint } from "@/src/features/in-app-agent/types";
import { type AgUiRunAgentInput } from "@langfuse/shared/in-app-agent";

type InAppAgentContext = AgUiRunAgentInput["context"];

export function createInAppAgentMessageEntryPointContext(
  entryPoint: InAppAgentMessageEntryPoint,
): InAppAgentContext {
  return [
    {
      description: MESSAGE_ENTRY_POINT_CONTEXT_DESCRIPTION,
      value: entryPoint,
    },
  ];
}
