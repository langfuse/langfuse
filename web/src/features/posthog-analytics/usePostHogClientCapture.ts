import { type CaptureResult, type CaptureOptions } from "posthog-js";
import { usePostHog } from "posthog-js/react";

// resource:action, only use snake_case
const events = {
  table: [
    "filter_builder_open",
    "filter_builder_close",
    "search_submit",
    "row_height_switch_select",
    "pagination_button_click",
    "pagination_page_size_select",
    "column_visibility_change",
    "column_sorting_header_click",
    "bookmark_button_click",
    "column_visibility_changed",
  ],
  trace: ["delete_form_open", "delete", "delete_form_submit"],
  trace_detail: [
    "publish_button_click",
    "bookmark_button_click",
    "observation_tree_collapse",
    "observation_tree_expand",
    "observation_tree_toggle_scores",
    "observation_tree_toggle_metrics",
    "io_mode_switch",
    "test_in_playground_button_click",
    "display_mode_switch",
  ],
  generations: ["export"],
  score: [
    "create",
    "update",
    "delete",
    "update_form_open",
    "create_form_open",
    "update_comment",
    "delete_comment",
  ],
  score_configs: [
    "create_form_submit",
    "manage_configs_item_click",
    "archive_form_open",
    "archive_form_submit",
  ],
  models: ["delete_button_click", "new_form_submit", "new_form_open"],
  prompts: [
    "new_form_submit",
    "new_form_open",
    "update_form_open",
    "update_form_submit",
  ],
  prompt_detail: [
    "test_in_playground_button_click",
    "add_label_submit",
    "apply_labels",
    "version_delete_open",
    "version_delete_submit",
  ],
  session_detail: ["publish_button_click"],
  eval_config: ["delete", "new_form_submit", "new_form_open"],
  eval_templates: [
    "view_version",
    "new_form_open",
    "update_form_open",
    "new_form_submit",
    "update_form_submit",
  ],
  integrations: ["posthog_form_submitted"],
  sign_in: ["cloud_region_switch", "button_click"],
  auth: ["reset_password_email_requested", "update_password_form_submit"],
  playground: [
    "execute_button_click",
    "save_to_new_prompt_button_click",
    "save_to_prompt_version_button_click",
  ],
  dashboard: ["chart_tab_switch", "date_range_changed"],
  datasets: [
    "delete_form_open",
    "delete_dataset_button_click",
    "update_form_open",
    "delete_form_open",
    "new_form_open",
    "new_form_submit",
    "update_form_submit",
    "delete_form_submit",
  ],
  projects: ["new_form_submit", "new_form_open"],
  dataset_item: [
    "archive_toggle",
    "new_form_open",
    "new_form_submit",
    "new_from_trace_form_submit",
    "new_from_trace_form_open",
  ],
  notification: ["click_link", "dismiss_notification"],
  tag: [
    "add_existing_tag",
    "remove_tag",
    "modal_open",
    "create_new_button_click",
  ],
  onboarding: ["code_example_tab_switch"],
  user_settings: ["theme_changed"],
  project_settings: [
    "project_delete",
    "rename_form_submit",
    "project_transfer",
    "api_key_delete",
    "api_key_create",
    "llm_api_key_delete",
    "llm_api_key_create",
    "send_membership_invitation",
    "delete_membership_invitation",
    "delete_membership",
    "pricing_dialog_opened",
  ],
  help_popup: ["opened", "href_clicked"],
  navigate_detail_pages: ["button_click_prev_or_next"],
} as const;

// type that represents all possible event names, e.g. "traces:bookmark"
type EventName = {
  [Resource in keyof typeof events]: `${Resource}:${(typeof events)[Resource][number]}`;
}[keyof typeof events];

export const usePostHogClientCapture = () => {
  const posthog = usePostHog();

  // wrapped posthog.capture function that only allows events that are in the allowlist
  function capture(
    eventName: EventName,
    properties?: Record<string, any> | null,
    options?: CaptureOptions,
  ): CaptureResult | void {
    return posthog.capture(eventName, properties, options);
  }

  return capture;
};
