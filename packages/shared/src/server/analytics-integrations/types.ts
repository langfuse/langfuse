// Standard analytics event types for analytics integrations (PostHog, Mixpanel, etc.)
// These represent the raw data structure from ClickHouse queries

export type AnalyticsTraceEvent = {
  langfuse_id: unknown;
  timestamp: unknown;
  langfuse_trace_name?: unknown;
  langfuse_url?: unknown;
  langfuse_user_url?: unknown;
  langfuse_cost_usd?: unknown;
  langfuse_count_observations?: unknown;
  langfuse_session_id?: unknown;
  langfuse_project_id?: unknown;
  langfuse_project_name?: unknown;
  langfuse_user_id?: unknown;
  langfuse_latency?: unknown;
  langfuse_release?: unknown;
  langfuse_version?: unknown;
  langfuse_tags?: unknown;
  langfuse_environment?: unknown;
  langfuse_event_version?: unknown;
  posthog_session_id?: unknown;
  mixpanel_session_id?: unknown;
};

export type AnalyticsGenerationEvent = {
  langfuse_id: unknown;
  timestamp: unknown;
  langfuse_generation_name?: unknown;
  langfuse_trace_name?: unknown;
  langfuse_trace_id?: unknown;
  langfuse_url?: unknown;
  langfuse_user_url?: unknown;
  langfuse_cost_usd?: unknown;
  langfuse_input_units?: unknown;
  langfuse_output_units?: unknown;
  langfuse_total_units?: unknown;
  langfuse_session_id?: unknown;
  langfuse_project_id?: unknown;
  langfuse_project_name?: unknown;
  langfuse_user_id?: unknown;
  langfuse_latency?: unknown;
  langfuse_time_to_first_token?: unknown;
  langfuse_release?: unknown;
  langfuse_version?: unknown;
  langfuse_model?: unknown;
  langfuse_level?: unknown;
  langfuse_tags?: unknown;
  langfuse_environment?: unknown;
  langfuse_event_version?: unknown;
  posthog_session_id?: unknown;
  mixpanel_session_id?: unknown;
};

export type AnalyticsScoreEvent = {
  langfuse_id: unknown;
  timestamp: unknown;
  langfuse_score_name?: unknown;
  langfuse_score_value?: unknown;
  langfuse_score_comment?: unknown;
  langfuse_score_metadata?: unknown;
  langfuse_score_string_value?: unknown;
  langfuse_score_data_type?: unknown;
  langfuse_trace_name?: unknown;
  langfuse_trace_id?: unknown;
  langfuse_user_url?: unknown;
  langfuse_session_id?: unknown;
  langfuse_project_id?: unknown;
  langfuse_project_name?: unknown;
  langfuse_user_id?: unknown;
  langfuse_release?: unknown;
  langfuse_tags?: unknown;
  langfuse_environment?: unknown;
  langfuse_event_version?: unknown;
  langfuse_score_entity_type?: unknown;
  langfuse_dataset_run_id?: unknown;
  posthog_session_id?: unknown;
  mixpanel_session_id?: unknown;
};

export type AnalyticsObservationEvent = {
  langfuse_id: unknown;
  timestamp: unknown;
  langfuse_observation_name?: unknown;
  langfuse_trace_name?: unknown;
  langfuse_trace_id?: unknown;
  langfuse_url?: unknown;
  langfuse_user_url?: unknown;
  langfuse_cost_usd?: unknown;
  langfuse_input_units?: unknown;
  langfuse_output_units?: unknown;
  langfuse_total_units?: unknown;
  langfuse_session_id?: unknown;
  langfuse_project_id?: unknown;
  langfuse_project_name?: unknown;
  langfuse_user_id?: unknown;
  langfuse_latency?: unknown;
  langfuse_time_to_first_token?: unknown;
  langfuse_release?: unknown;
  langfuse_version?: unknown;
  langfuse_model?: unknown;
  langfuse_level?: unknown;
  langfuse_type?: unknown;
  langfuse_tags?: unknown;
  langfuse_environment?: unknown;
  langfuse_event_version?: unknown;
  posthog_session_id?: unknown;
  mixpanel_session_id?: unknown;
};
