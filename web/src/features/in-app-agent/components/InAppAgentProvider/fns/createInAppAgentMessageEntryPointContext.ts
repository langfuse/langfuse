import {
  MESSAGE_ENTRY_POINT_CONTEXT_DESCRIPTION,
  type InAppAgentMessageEntryPoint,
} from "@/src/features/in-app-agent/context";
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
