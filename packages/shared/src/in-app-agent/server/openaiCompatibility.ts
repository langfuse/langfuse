import { isOpenAICompatibleEndpoint } from "../../server/llm/ai-sdk/providers/openai";

export { isOpenAICompatibleEndpoint };

const RESPONSES_CALL = {
  apiMode: "responses" as const,
  // Stateless: reasoning round-trips as encrypted content instead of by item
  // id, so nothing is stored at OpenAI and Zero Data Retention orgs work.
  providerOptions: {
    openai: { reasoningSummary: "auto" as const, store: false },
  },
};

const CHAT_COMPLETIONS_CALL = {
  apiMode: "chat-completions" as const,
  // LiteLLM / OpenAI-compatible Chat Completions knob. Gateways such as
  // LiteLLM and OpenRouter translate `reasoning_effort` into the upstream
  // model's thinking config. The compatible SDK maps response
  // `reasoning_content` to thinking deltas.
  providerOptions: { openai: { reasoningEffort: "medium" as const } },
};

/**
 * Instance-AI equivalent of a project LLM connection's `useResponsesApi`
 * toggle. Unset follows first-party OpenAI (`api.openai.com` / blank URL);
 * any other host stays on Chat Completions until the operator opts in.
 */
export function resolveLangfuseAIOpenAICall(params: {
  baseURL?: string | null;
  useResponsesApi?: boolean | "true" | "false";
}) {
  if (params.useResponsesApi === true || params.useResponsesApi === "true") {
    return RESPONSES_CALL;
  }
  if (params.useResponsesApi === false || params.useResponsesApi === "false") {
    return CHAT_COMPLETIONS_CALL;
  }

  return isOpenAICompatibleEndpoint(params.baseURL)
    ? CHAT_COMPLETIONS_CALL
    : RESPONSES_CALL;
}
