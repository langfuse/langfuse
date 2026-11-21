import {
  getInvalidLlmBaseUrlReason,
  LLMAdapter,
  type TypeSafeUpstream,
} from "@langfuse/shared";

/**
 * Shows a server base URL error on the Base URL field when the form renders
 * one for the adapter, opening the advanced settings if the field lives there.
 * Every other error goes to the form's root error.
 */
export function getLlmConnectionSaveErrorTarget(params: {
  message: string;
  adapter: LLMAdapter;
  typeSafeUpstreamId: TypeSafeUpstream["id"];
}) {
  const baseURLReason = getInvalidLlmBaseUrlReason(params.message);
  const placement = getBaseURLFieldPlacement(
    params.adapter,
    params.typeSafeUpstreamId,
  );
  if (baseURLReason === null || placement === null) {
    return { field: "root", message: params.message } as const;
  }
  return {
    field: "baseURL",
    message: baseURLReason,
    opensAdvancedSettings: placement === "advanced",
  } as const;
}

/** Where the form renders the Base URL field, or null when it renders none. */
export function getBaseURLFieldPlacement(
  adapter: LLMAdapter,
  typeSafeUpstreamId: TypeSafeUpstream["id"],
) {
  switch (adapter) {
    case LLMAdapter.OpenAI:
    case LLMAdapter.Anthropic:
    case LLMAdapter.VertexAI:
    case LLMAdapter.GoogleAIStudio:
      return "advanced";
    case LLMAdapter.Azure:
      return "main";
    case LLMAdapter.TypeSafe:
      return typeSafeUpstreamId === "custom" ? "main" : null;
    case LLMAdapter.Bedrock:
      return null;
  }
}
