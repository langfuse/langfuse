import {
  IN_APP_AGENT_MESSAGE_ENTRY_POINTS,
  MESSAGE_ENTRY_POINT_CONTEXT_DESCRIPTION,
} from "@/src/features/in-app-agent/context";
import { type AgUiRunAgentInput } from "@langfuse/shared/in-app-agent";

type InAppAgentContext = AgUiRunAgentInput["context"];

// Telemetry only, like quick-action attribution: read for trace metadata but
// never forwarded into the model-visible sanitized context.
export function getInAppAgentMessageEntryPointTraceMetadata(
  context: InAppAgentContext,
): Record<string, string> {
  const entryPoint = context
    .find(
      (item) => item.description === MESSAGE_ENTRY_POINT_CONTEXT_DESCRIPTION,
    )
    ?.value.trim();

  return entryPoint &&
    (IN_APP_AGENT_MESSAGE_ENTRY_POINTS as readonly string[]).includes(
      entryPoint,
    )
    ? { message_entry_point: entryPoint }
    : {};
}
