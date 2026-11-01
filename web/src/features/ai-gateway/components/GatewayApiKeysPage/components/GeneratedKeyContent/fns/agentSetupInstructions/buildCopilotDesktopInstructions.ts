import { AGENT_SETUP_DOCS_URLS } from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import type {
  AgentSetupContext,
  AgentSetupInstructions,
} from "@/src/features/ai-gateway/types/agentSetupInstructions";

export function buildCopilotDesktopInstructions(
  context: AgentSetupContext,
): AgentSetupInstructions {
  return {
    id: "copilot-desktop",
    label: "GitHub Copilot app",
    heading: "Route the GitHub Copilot app through the Langfuse AI Gateway",
    summary:
      "Add the gateway as a custom model provider in the GitHub Copilot app so every model call is recorded in Langfuse.",
    docsUrl: AGENT_SETUP_DOCS_URLS["copilot-desktop"],
    warning: context.providers.includes("OPENAI")
      ? undefined
      : "The GitHub Copilot app needs an OpenAI provider credential, and none is enabled yet.",
    steps: [
      {
        title: "Add a custom endpoint",
        description:
          "Open Settings → Model providers, select Add provider, then choose Custom endpoint. Set Display name to Langfuse.",
      },
      {
        title: "Set the gateway base URL",
        description: "Paste this URL exactly as shown.",
        language: "text",
        code: `${context.gatewayOrigin}/openai/v1`,
      },
      {
        title: "Choose the wire API and add your gateway key",
        description:
          "Set Wire API to responses, paste your gateway key as API key, leave Custom headers empty, then select Add provider.",
      },
      {
        title: "Pick a model",
        description:
          "The models of your OpenAI provider credential appear in the model picker alongside the GitHub-hosted models. Select one to start a session.",
      },
    ],
  };
}
