import type { AgUiRunAgentInput } from "@/src/features/in-app-agent/schema";

export function createInAppAgentScreenContext(params: {
  currentUrl: string;
}): AgUiRunAgentInput["context"] {
  return [
    {
      description: "current_url",
      value: params.currentUrl,
    },
  ];
}
