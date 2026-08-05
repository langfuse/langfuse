export const CURRENT_URL_CONTEXT_DESCRIPTION = "current_url";
export const QUICK_ACTION_KEY_CONTEXT_DESCRIPTION = "quick_action_key";
export const QUICK_ACTION_CATEGORY_CONTEXT_DESCRIPTION =
  "quick_action_category";
export const MESSAGE_ENTRY_POINT_CONTEXT_DESCRIPTION = "message_entry_point";

export const IN_APP_AGENT_QUICK_ACTION_CONTEXTS = [
  "observability",
  "prompts",
  "evaluation",
  "dashboards",
] as const;

export const IN_APP_AGENT_MESSAGE_ENTRY_POINTS = [
  "chat",
  "add-widget-modal",
] as const;
