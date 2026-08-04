import { CURRENT_URL_CONTEXT_DESCRIPTION } from "@/src/features/in-app-agent/context";
import { type AgUiRunAgentInput } from "@langfuse/shared/in-app-agent";

type InAppAgentContext = AgUiRunAgentInput["context"];

export function createInAppAgentScreenContext(params: {
  currentUrl: string;
}): InAppAgentContext {
  return [
    {
      description: CURRENT_URL_CONTEXT_DESCRIPTION,
      value: params.currentUrl,
    },
  ];
}
