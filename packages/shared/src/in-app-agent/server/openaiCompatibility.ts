import { isOpenAICompatibleEndpoint } from "../../server/llm/ai-sdk/providers/openai";

export { isOpenAICompatibleEndpoint };

export type LangfuseAIOpenAIApiMode = "responses" | "chat-completions";

export type LangfuseAIOpenAICall = {
  apiMode: LangfuseAIOpenAIApiMode;
  providerOptions?: {
    openai: {
      reasoningSummary?: "auto";
      reasoningEffort?: "medium";
    };
  };
};

const RESPONSES_CALL: LangfuseAIOpenAICall = {
  apiMode: "responses",
  providerOptions: { openai: { reasoningSummary: "auto" } },
};

const CHAT_COMPLETIONS_CALL: LangfuseAIOpenAICall = {
  apiMode: "chat-completions",
  // LiteLLM / OpenAI-compatible Chat Completions knob. Gateways such as
  // LiteLLM and OpenRouter translate `reasoning_effort` into the upstream
  // model's thinking config. The compatible SDK maps response
  // `reasoning_content` to thinking deltas.
  providerOptions: { openai: { reasoningEffort: "medium" } },
};

/**
 * Instance-AI equivalent of a project LLM connection's `useResponsesApi`
 * toggle. Unset follows first-party OpenAI (`api.openai.com` / blank URL);
 * any other host stays on Chat Completions until the operator opts in.
 */
export function resolveLangfuseAIOpenAICall(params: {
  baseURL?: string | null;
  useResponsesApi?: boolean;
}): LangfuseAIOpenAICall {
  const useResponsesApi =
    params.useResponsesApi ?? !isOpenAICompatibleEndpoint(params.baseURL);

  return useResponsesApi ? RESPONSES_CALL : CHAT_COMPLETIONS_CALL;
}

export function parseLangfuseAIUseResponsesApi(
  value: "true" | "false" | undefined,
): boolean | undefined {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}
