import { isOpenAICompatibleEndpoint } from "../../server/llm/ai-sdk/providers/openai";

export { isOpenAICompatibleEndpoint };

/**
 * Chat Completions `reasoning_effort` values. `none` is an upstream value and
 * is sent as one; `off` is not, and omits the field from the request instead,
 * for compatible servers that reject the parameter rather than a value.
 */
export type LangfuseAIReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "off";

const RESPONSES_CALL = {
  apiMode: "responses" as const,
  // Stateless: reasoning round-trips as encrypted content instead of by item
  // id, so nothing is stored at OpenAI and Zero Data Retention orgs work.
  providerOptions: {
    openai: { reasoningSummary: "auto" as const, store: false },
  },
};

const DEFAULT_REASONING_EFFORT = "medium" as const;

type ChatCompletionsOpenAIOptions = {
  reasoningEffort?: Exclude<LangfuseAIReasoningEffort, "off">;
};

function chatCompletionsCall(
  effort: LangfuseAIReasoningEffort = DEFAULT_REASONING_EFFORT,
) {
  // LiteLLM / OpenAI-compatible Chat Completions knob. Gateways such as
  // LiteLLM and OpenRouter translate `reasoning_effort` into the upstream
  // model's thinking config. The compatible SDK maps response
  // `reasoning_content` to thinking deltas. Each server accepts its own set
  // of values, so the operator picks one or drops the field entirely.
  const openai: ChatCompletionsOpenAIOptions =
    effort === "off" ? {} : { reasoningEffort: effort };

  return { apiMode: "chat-completions" as const, providerOptions: { openai } };
}

/**
 * Instance-AI equivalent of a project LLM connection's `useResponsesApi`
 * toggle. Unset follows first-party OpenAI (`api.openai.com` / blank URL);
 * any other host stays on Chat Completions until the operator opts in.
 * `reasoningEffort` reaches Chat Completions only: the Responses API carries
 * its reasoning configuration in `reasoningSummary` instead.
 */
export function resolveLangfuseAIOpenAICall(params: {
  baseURL?: string | null;
  useResponsesApi?: boolean | "true" | "false";
  reasoningEffort?: LangfuseAIReasoningEffort;
}) {
  if (params.useResponsesApi === true || params.useResponsesApi === "true") {
    return RESPONSES_CALL;
  }
  if (params.useResponsesApi === false || params.useResponsesApi === "false") {
    return chatCompletionsCall(params.reasoningEffort);
  }

  return isOpenAICompatibleEndpoint(params.baseURL)
    ? chatCompletionsCall(params.reasoningEffort)
    : RESPONSES_CALL;
}
