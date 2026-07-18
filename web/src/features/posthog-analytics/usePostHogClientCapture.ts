import { type CaptureResult, type CaptureOptions } from "posthog-js";
import { usePostHog } from "posthog-js/react";
import { useCallback } from "react";

export const V4_BETA_ENABLED_POSTHOG_PROPERTY = "v4BetaEnabled";

// resource:action, only use snake_case
// Exported to silence @typescript-eslint/no-unused-vars v8 warning
// (used for type extraction via typeof, which is a legitimate pattern)
export const events = {
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
    "io_pretty_format_toggle_group",
    "test_in_playground_button_click",
    "display_mode_switch",
    "download_button_click",
    "view_mode_switch",
    "tree_panel_toggle",
    "graph_view_toggle",
    // Aggregated vs expanded graph build mode (LFE-10676).
    "graph_mode_switch",
    // `source` distinguishes the inline expand/collapse button from the
    // trace settings switch; `collapsed` is the new preference value.
    "system_prompt_collapse_toggle",
    // Fired from the tree, timeline, graph, and search-result click handlers;
    // `source` says which surface drove the navigation.
    "node_selected",
    // Download from the large-string IO fallback (LFE-10991): a top-level
    // string over the render limit is shown as a bounded preview + download
    // instead of the full Pretty/JSON viewer. Measures how often users hit it.
    "large_string_field_download",
    // Raw download from the JSON-view fallback shown when a field is too large
    // to render in the unvirtualized viewer (LFE-10989).
    "json_view_large_field_download",
  ],
  // The shared table peek panel (opened via the `peek` URL param). Props carry
  // `routePattern` (the Next.js route pattern, never a concrete URL) so opens
  // can be sliced by surface without leaking ids.
  peek: ["opened", "closed", "expand_toggle", "resized", "open_in_new_tab"],
  generations: ["export"],
  saved_views: [
    "create",
    "update",
    "delete",
    "update_form_open",
    "create_form_open",
    "delete_form_open",
    "view_selected",
    "drawer_open",
    "drawer_close",
    "update_config",
    "permalink_generate",
    "permalink_visit",
    "update_name",
    "search_views",
    "system_preset_selected",
    "category_chip_open",
    "category_chip_apply",
    "category_preset_preview",
    "category_preset_coming_soon_click",
    // Fired when a chip popover closes; carries durationMs + outcome
    // ("applied" | "cleared" | "previewed_only" | "no_interaction") so the
    // explore → activate funnel and dwell time read from one event.
    "category_chip_close",
    // A bookmarked/stored system-preset id that the catalog retired — the
    // user was shown the one-time notice and landed on the default view.
    "retired_view_redirect",
    "applied",
  ],
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
    "update_form_submit",
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
    "duplicate_button_click",
    "duplicate_form_submit",
  ],
  session_detail: [
    "publish_button_click",
    "download_button_click",
    "copy_session_id_click",
    "truncated_observation_open_trace_click",
    "truncated_observation_download_click",
  ],
  eval_config: [
    "new_form_submit",
    "new_form_open",
    "activate",
    "deactivate",
    "update",
    "delete_form_open",
    "delete_evaluator_button_click",
  ],
  eval_templates: [
    "view_version",
    "new_form_open",
    "update_form_open",
    "new_form_submit",
    "update_form_submit",
    "delete_form_open",
    "delete_template_button_click",
  ],
  integrations: [
    "posthog_form_submitted",
    "blob_storage_form_submitted",
    "mixpanel_form_submitted",
  ],
  sign_in: ["cloud_region_switch", "button_click"],
  sign_up: ["button_click"],
  auth: [
    "reset_password_email_requested",
    "update_password_form_submit",
    "set_password_form_submit",
  ],
  playground: [
    "execute_button_click",
    "save_to_new_prompt_button_click",
    "save_to_prompt_version_button_click",
  ],
  dashboard: [
    "clone_dashboard",
    "home_dashboard_viewed",
    "home_dashboard_peeked",
    "home_dashboard_set_default",
    "home_edit_pencil_click",
    "locked_edit_attempt",
    "clone_first_cancelled",
    "clone_open_existing_click",
    "widget_copy_first_open",
    "widget_copied_to_project",
    "widget_json_downloaded",
    "widget_copied_to_clipboard",
    "widget_view_as_table",
    "widget_pasted",
    "widget_paste_rejected",
    "widget_duplicated",
    "dashboard_json_imported",
    "add_widget_dialog_open",
    "add_widget_tab_switch",
    "widget_added",
    "dashboard_renamed_inline",
    "chart_tab_switch",
    "date_range_changed",
    "new_widget_form_open",
    "new_dashboard_form_open",
    "delete_widget_form_open",
    "delete_dashboard_form_open",
    "delete_dashboard_button_click",
  ],
  monitors: ["delete_form_open", "delete_monitor_button_click"],
  datasets: [
    "delete_form_open",
    "delete_dataset_button_click",
    "update_form_open",
    "new_form_open",
    "new_form_submit",
    "update_form_submit",
    "delete_form_submit",
  ],
  organizations: [
    "new_form_submit",
    "new_form_open",
    "demo_project_button_click",
  ],
  projects: ["new_form_submit", "new_form_open"],
  dataset_item: [
    "archive_toggle",
    "new_form_open",
    "new_form_submit",
    "new_from_trace_form_submit",
    "new_from_trace_form_open",
    "upload_csv_button_click",
    "upload_csv_form_submit",
    "select_observations_button_click",
    "delete",
  ],
  dataset_run: [
    "delete_form_open",
    "delete_form_submit",
    "new_form_open",
    "new_form_submit",
    "view_prompt_experiment_docs",
    "view_custom_experiment_docs",
    "compare_view_click",
    "charts_view_added",
    "charts_view_removed",
    "compare_run_added",
    "compare_run_removed",
  ],
  notification: ["click_link", "dismiss_notification"],
  toast: ["report_issue", "dismiss"],
  tag: [
    "add_existing_tag",
    "remove_tag",
    "modal_open",
    "create_new_button_click",
  ],
  onboarding: [
    "code_example_tab_switch",
    "tracing_check_active",
    "tracing_agent_prompt_copy_clicked",
    "tracing_manual_docs_link_clicked",
  ],
  user_settings: ["theme_changed"],
  project_settings: [
    "project_delete",
    "rename_form_submit",
    "retention_form_submit",
    "project_transfer",
    "api_key_delete",
    "api_key_create",
    "llm_api_key_delete",
    "llm_api_key_create",
    "llm_api_key_update",
    "send_membership_invitation",
    "delete_membership_invitation",
    "delete_membership",
    "pricing_dialog_opened",
  ],
  organization_settings: [
    "rename_form_submit",
    "send_membership_invitation",
    "delete_membership_invitation",
    "delete_membership",
    "api_key_create",
    "api_key_delete",
    "pricing_dialog_opened",
    "delete_organization",
    "ai_features_toggle",
    "ai_telemetry_toggle",
  ],
  help_popup: ["opened", "href_clicked"],
  navigate_detail_pages: ["button_click_prev_or_next"],
  support_chat: [
    "initiated",
    "opened",
    "message_sent",
    "community_hours_click",
  ], // also used on landing page for consistency
  in_app_agent: [
    "entry_point_click",
    "new_chat_started",
    "new_chat_turn",
    "quick_action_started",
  ],
  cmd_k_menu: ["opened", "search_entered", "navigated"],
  spend_alert: ["created", "updated", "deleted"],
  sidebar: ["book_a_call_clicked", "v4_beta_toggled"],
  // Filter/search-bar usage analytics (LFE-10781). METADATA ONLY — payloads
  // never carry a raw filter value, search text, or AI prompt (PII). Only
  // type/column/operator/key(field-name)/counts/lengths/booleans/enums.
  // `isV4` on every event reflects fast-mode (v4 events table) at action time.
  filters: [
    "applied",
    "cleared",
    "facet_operator_toggled",
    "active_only_toggled",
    "facet_added",
    "facet_mode_switched",
    "sidebar_toggled",
    "search_submitted",
    "search_error",
    "ai_generate_requested",
    "ai_generate_applied",
    "ai_generate_failed",
  ],
} as const;

// type that represents all possible event names, e.g. "traces:bookmark"
type EventName = {
  [Resource in keyof typeof events]: `${Resource}:${(typeof events)[Resource][number]}`;
}[keyof typeof events];

export const usePostHogClientCapture = () => {
  const posthog = usePostHog();

  // wrapped posthog.capture function that only allows events that are in the
  // allowlist; stable identity so it is safe in useCallback/useMemo deps
  return useCallback(
    function capture(
      eventName: EventName,
      properties?: Record<string, any> | null,
      options?: CaptureOptions,
    ): CaptureResult | void {
      return posthog.capture(eventName, properties, options);
    },
    [posthog],
  );
};
