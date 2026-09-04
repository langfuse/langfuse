import { type CaptureResult, type CaptureOptions } from "posthog-js";
import { usePostHog } from "posthog-js/react";
import { useCallback } from "react";

export const V4_BETA_ENABLED_POSTHOG_PROPERTY = "v4BetaEnabled";

// resource:action, only use snake_case
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used via typeof
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
    "column_visibility_changed",
  ],
  trace: ["delete_form_open", "delete", "delete_form_submit"],
  trace_detail: [
    "publish_button_click",
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
    // `source` distinguishes the inline expand/collapse button, the message
    // header control, and the trace settings switch; `collapsed` is the new
    // preference value.
    "system_prompt_collapse_toggle",
    // Fired from the tree, timeline, graph, and search-result click handlers;
    // `source` says which surface drove the navigation.
    "node_selected",
    // Trace playhead transport in the navigation header (and the overflow
    // menu on a narrow panel). Distinguishes play vs pause vs stop; `viewMode`
    // is tree vs timeline at click time; `observationCount` is the loaded
    // trace size. Metadata only — never a trace/observation id.
    "playback_play",
    "playback_pause",
    "playback_stop",
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
  // Pulse outlier strip above the v4 events table (LFE-14451). Props are
  // metadata only — mode/metric/aggregation enums, gesture trigger, bucket
  // counts — never bucket values or time-range contents.
  pulse: [
    "drill_in",
    "preview_pinned",
    "mode_switch",
    "aggregation_switch",
    "closed",
    "reopened",
  ],
  generations: ["export"],
  // Lazy JSON viewer perf telemetry (LFE-14419): learn whether the size gate
  // and main-thread assumptions hold on real payloads. Metadata only —
  // durations, char counts, tier; never payload content.
  json_viewer: ["indexed", "slow_expand"],
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
    "add_category_inline",
    "archive_form_open",
    "archive_form_submit",
  ],
  models: ["delete_button_click", "new_form_submit", "new_form_open"],
  prompts: [
    "new_form_submit",
    "new_form_open",
    "update_form_open",
    "update_form_submit",
    "bulk_export",
    "bulk_import_submit",
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
    "inline_tools_toggled",
    "system_prompt_toggled",
    "metadata_jsonpath_config_changed",
    "header_detail_visibility_changed",
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
  evaluators: [
    "create",
    "update",
    "delete",
    "test",
    "saved_dialog_submit",
    "overview_action_click",
    "variable_mapping_configured",
    "version_history_interaction",
    "default_model_update",
    "reactivate",
    "gallery_creation_source_select",
    "empty_state_template_select",
    "empty_state_browse_library",
    "empty_state_detect_topics",
    "alert_create_clicked",
  ],
  evaluation_rules: [
    "create",
    "update",
    "delete",
    "status_change",
    "attach_evaluator",
    "detach_evaluator",
    "filter_reused",
  ],
  // One-shot batch evaluation from the events / experiments tables.
  // Counts and enums only — never mapping contents or observation payloads.
  batch_eval: ["run"],
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
    "view",
    "widget_saved",
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
    "widget_high_cardinality_error",
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
  monitors: ["create", "delete_form_open", "delete_monitor_button_click"],
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
  // Experiments UI (v4). Metadata only — counts/enums/booleans/field names;
  // never experiment or dataset names, score values, or item content.
  // `isV4` + `tableName` on every event. `source` on comparison/baseline
  // distinguishes picker vs table-selection vs url (deep link / redirect).
  experiment: [
    "comparison_changed",
    "comparison_picker_opened",
    "baseline_changed",
    "chart_metric_changed",
    "charts_section_toggled",
    "analytics_tab_opened",
    "score_column_scope_toggled",
    "item_regression_filter_applied",
  ],
  // Version-update reload notification (LFE-10978). `banner_shown` fires once
  // per appearance; the two actions measure the reload-vs-dismiss split. No
  // props carry user content.
  version_update: ["banner_shown", "reload_clicked", "dismissed"],
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
    "tracing_api_key_create_clicked",
    "tracing_agent_prompt_copy_clicked",
    "tracing_manual_docs_link_clicked",
  ],
  user_settings: ["theme_changed", "feature_preview_toggled"],
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
    "feature_flag_default_toggled",
    "user_feature_flag_toggled",
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
    "activity_opened",
    "entry_point_click",
    "new_chat_started",
    "new_chat_turn",
    "quick_action_started",
    "tool_approval_decided",
  ],
  cmd_k_menu: ["opened", "search_entered", "navigated"],
  spend_alert: ["created", "updated", "deleted"],
  sidebar: [
    "book_a_call_clicked",
    "v4_beta_toggled",
    "v4_migration_card_clicked",
  ],
  // Migration-funnel events answer "are people finding the panel, which
  // action items do they engage with, and which CTA do they use?"
  // panel_opened carries the entry surface; panel_checks_loaded carries the
  // amount of work shown (counts only — never keys or SDK payload values).
  v4_migration: [
    "coding_agent_prompt_copied",
    "delay_badge_clicked",
    // Discoverability pair for the table delay badge: `shown` is the
    // exposure denominator (badge actually rendered), `hovered` counts
    // noticed-but-not-clicked (pill expanded long enough to read).
    "delay_badge_shown",
    "delay_badge_hovered",
    "project_chip_clicked",
    "contact_book_call_clicked",
    "contact_support_clicked",
    "status_row_clicked",
    "update_required_badge_clicked",
    "migrate_evals_with_agent_clicked",
    "overview_banner_status_clicked",
    "overview_banner_docs_clicked",
    "panel_docs_link_clicked",
    "create_project_keys_clicked",
    "panel_opened",
    "panel_checks_loaded",
    "section_expanded",
    "evidence_link_clicked",
    "section_link_clicked",
    "project_keys_copied",
    "evals_manual_upgrade_clicked",
    "walkthrough_video_clicked",
  ],
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
    "facet_search",
    "facet_mode_switched",
    "expand_all_toggled",
    "facet_toggled",
    "sidebar_toggled",
    "search_submitted",
    "search_error",
    "ai_generate_requested",
    "ai_generate_applied",
    "ai_generate_failed",
  ],
} as const;

// type that represents all possible event names, e.g. "trace:delete"
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
