import type { GatewayApiFormat } from "@/src/features/ai-gateway/server/provider/registry";

export const CUSTOM_PROVIDER_MAX_API_FORMATS = 2;

export const CUSTOM_PROVIDER_API_FORMATS_ERROR = `Select at least one and at most ${CUSTOM_PROVIDER_MAX_API_FORMATS} endpoints.`;

/** The endpoints a custom provider can serve, in display order. */
export const customProviderApiFormatOptions = [
  { value: "anthropic.messages", label: "Messages", format: "Anthropic" },
  { value: "openai.responses", label: "Responses", format: "OpenAI" },
  {
    value: "openai.chat-completions",
    label: "Chat Completions",
    format: "OpenAI",
  },
] as const satisfies readonly {
  value: GatewayApiFormat;
  label: string;
  format: string;
}[];
