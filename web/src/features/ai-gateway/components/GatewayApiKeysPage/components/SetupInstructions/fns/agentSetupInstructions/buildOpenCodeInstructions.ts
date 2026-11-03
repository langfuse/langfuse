import {
  AGENT_SETUP_DOCS_URLS,
  GATEWAY_KEY_PLACEHOLDER,
} from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import type {
  AgentSetupContext,
  AgentSetupInstructions,
} from "@/src/features/ai-gateway/types/agentSetupInstructions";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

type OpenCodeProvider = Extract<GatewayProvider, "ANTHROPIC" | "OPENAI">;

/** OpenCode appends only `/messages`, so its Anthropic base URL keeps `/v1`.
 * Custom connections have no built-in OpenCode provider to override. */
const OPENCODE_PROVIDERS: Record<
  OpenCodeProvider,
  { id: string; path: string }
> = {
  ANTHROPIC: { id: "anthropic", path: "/anthropic/v1" },
  OPENAI: { id: "openai", path: "/openai/v1" },
};

const isOpenCodeProvider = (
  provider: GatewayProvider,
): provider is OpenCodeProvider => provider !== "CUSTOM";

export function buildOpenCodeInstructions(
  context: AgentSetupContext,
): AgentSetupInstructions {
  const enabledProviders = context.providers.filter(isOpenCodeProvider);
  const providers: OpenCodeProvider[] =
    enabledProviders.length > 0 ? enabledProviders : ["ANTHROPIC", "OPENAI"];
  const config = {
    $schema: "https://opencode.ai/config.json",
    providers: Object.fromEntries(
      providers.map((provider) => [
        OPENCODE_PROVIDERS[provider].id,
        {
          settings: {
            baseURL: `${context.gatewayOrigin}${OPENCODE_PROVIDERS[provider].path}`,
            apiKey: "{env:LANGFUSE_GATEWAY_KEY}",
          },
        },
      ]),
    ),
  };

  return {
    id: "opencode",
    label: "OpenCode",
    heading: "Route OpenCode through the Langfuse AI Gateway",
    summary:
      "Override OpenCode's built-in providers so every model call is recorded in Langfuse.",
    docsUrl: AGENT_SETUP_DOCS_URLS.opencode,
    warning:
      enabledProviders.length === 0
        ? "OpenCode needs an Anthropic or OpenAI provider credential, and none is enabled yet."
        : undefined,
    steps: [
      {
        title: "Export the gateway key",
        description:
          "Replace the placeholder with your gateway key. After changing it, run opencode service restart.",
        language: "sh",
        code: `export LANGFUSE_GATEWAY_KEY="${GATEWAY_KEY_PLACEHOLDER}"`,
      },
      {
        title: "Add the gateway providers",
        description:
          "Add this to ~/.config/opencode/opencode.json. Remove stored OpenCode account connections for these providers first; they take precedence.",
        language: "json",
        code: JSON.stringify(config, null, 2),
      },
      {
        title: "Start OpenCode",
        description: "Your sessions appear in Langfuse under Sessions.",
        language: "sh",
        code: "opencode",
      },
    ],
  };
}
