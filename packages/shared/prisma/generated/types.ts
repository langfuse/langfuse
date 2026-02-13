import type { ColumnType } from "kysely";
export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export const ApiKeyScope = {
  ORGANIZATION: "ORGANIZATION",
  PROJECT: "PROJECT",
} as const;
export type ApiKeyScope = (typeof ApiKeyScope)[keyof typeof ApiKeyScope];
export const Role = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
  VIEWER: "VIEWER",
  NONE: "NONE",
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const LegacyPrismaObservationType = {
  SPAN: "SPAN",
  EVENT: "EVENT",
  GENERATION: "GENERATION",
  AGENT: "AGENT",
  TOOL: "TOOL",
  CHAIN: "CHAIN",
  RETRIEVER: "RETRIEVER",
  EVALUATOR: "EVALUATOR",
  EMBEDDING: "EMBEDDING",
  GUARDRAIL: "GUARDRAIL",
} as const;
export type LegacyPrismaObservationType =
  (typeof LegacyPrismaObservationType)[keyof typeof LegacyPrismaObservationType];
export const LegacyPrismaObservationLevel = {
  DEBUG: "DEBUG",
  DEFAULT: "DEFAULT",
  WARNING: "WARNING",
  ERROR: "ERROR",
} as const;
export type LegacyPrismaObservationLevel =
  (typeof LegacyPrismaObservationLevel)[keyof typeof LegacyPrismaObservationLevel];
export const LegacyPrismaScoreSource = {
  ANNOTATION: "ANNOTATION",
  API: "API",
  EVAL: "EVAL",
} as const;
export type LegacyPrismaScoreSource =
  (typeof LegacyPrismaScoreSource)[keyof typeof LegacyPrismaScoreSource];
export const ScoreConfigDataType = {
  CATEGORICAL: "CATEGORICAL",
  NUMERIC: "NUMERIC",
  BOOLEAN: "BOOLEAN",
} as const;
export type ScoreConfigDataType =
  (typeof ScoreConfigDataType)[keyof typeof ScoreConfigDataType];
export const AnnotationQueueStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
} as const;
export type AnnotationQueueStatus =
  (typeof AnnotationQueueStatus)[keyof typeof AnnotationQueueStatus];
export const AnnotationQueueObjectType = {
  TRACE: "TRACE",
  OBSERVATION: "OBSERVATION",
  SESSION: "SESSION",
} as const;
export type AnnotationQueueObjectType =
  (typeof AnnotationQueueObjectType)[keyof typeof AnnotationQueueObjectType];
export const DatasetStatus = {
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type DatasetStatus = (typeof DatasetStatus)[keyof typeof DatasetStatus];
export const CommentObjectType = {
  TRACE: "TRACE",
  OBSERVATION: "OBSERVATION",
  SESSION: "SESSION",
  PROMPT: "PROMPT",
} as const;
export type CommentObjectType =
  (typeof CommentObjectType)[keyof typeof CommentObjectType];
export const NotificationChannel = {
  EMAIL: "EMAIL",
} as const;
export type NotificationChannel =
  (typeof NotificationChannel)[keyof typeof NotificationChannel];
export const NotificationType = {
  COMMENT_MENTION: "COMMENT_MENTION",
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];
export const AuditLogRecordType = {
  USER: "USER",
  API_KEY: "API_KEY",
} as const;
export type AuditLogRecordType =
  (typeof AuditLogRecordType)[keyof typeof AuditLogRecordType];
export const JobType = {
  EVAL: "EVAL",
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];
export const JobConfigState = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;
export type JobConfigState =
  (typeof JobConfigState)[keyof typeof JobConfigState];
export const JobExecutionStatus = {
  COMPLETED: "COMPLETED",
  ERROR: "ERROR",
  PENDING: "PENDING",
  CANCELLED: "CANCELLED",
  DELAYED: "DELAYED",
} as const;
export type JobExecutionStatus =
  (typeof JobExecutionStatus)[keyof typeof JobExecutionStatus];
export const BlobStorageIntegrationFileType = {
  JSON: "JSON",
  CSV: "CSV",
  JSONL: "JSONL",
} as const;
export type BlobStorageIntegrationFileType =
  (typeof BlobStorageIntegrationFileType)[keyof typeof BlobStorageIntegrationFileType];
export const BlobStorageIntegrationType = {
  S3: "S3",
  S3_COMPATIBLE: "S3_COMPATIBLE",
  AZURE_BLOB_STORAGE: "AZURE_BLOB_STORAGE",
} as const;
export type BlobStorageIntegrationType =
  (typeof BlobStorageIntegrationType)[keyof typeof BlobStorageIntegrationType];
export const BlobStorageExportMode = {
  FULL_HISTORY: "FULL_HISTORY",
  FROM_TODAY: "FROM_TODAY",
  FROM_CUSTOM_DATE: "FROM_CUSTOM_DATE",
} as const;
export type BlobStorageExportMode =
  (typeof BlobStorageExportMode)[keyof typeof BlobStorageExportMode];
export const AnalyticsIntegrationExportSource = {
  TRACES_OBSERVATIONS: "TRACES_OBSERVATIONS",
  TRACES_OBSERVATIONS_EVENTS: "TRACES_OBSERVATIONS_EVENTS",
  EVENTS: "EVENTS",
} as const;
export type AnalyticsIntegrationExportSource =
  (typeof AnalyticsIntegrationExportSource)[keyof typeof AnalyticsIntegrationExportSource];
export const DashboardWidgetViews = {
  TRACES: "TRACES",
  OBSERVATIONS: "OBSERVATIONS",
  SCORES_NUMERIC: "SCORES_NUMERIC",
  SCORES_CATEGORICAL: "SCORES_CATEGORICAL",
} as const;
export type DashboardWidgetViews =
  (typeof DashboardWidgetViews)[keyof typeof DashboardWidgetViews];
export const DashboardWidgetChartType = {
  LINE_TIME_SERIES: "LINE_TIME_SERIES",
  AREA_TIME_SERIES: "AREA_TIME_SERIES",
  BAR_TIME_SERIES: "BAR_TIME_SERIES",
  HORIZONTAL_BAR: "HORIZONTAL_BAR",
  VERTICAL_BAR: "VERTICAL_BAR",
  PIE: "PIE",
  NUMBER: "NUMBER",
  HISTOGRAM: "HISTOGRAM",
  PIVOT_TABLE: "PIVOT_TABLE",
} as const;
export type DashboardWidgetChartType =
  (typeof DashboardWidgetChartType)[keyof typeof DashboardWidgetChartType];
export const ActionType = {
  WEBHOOK: "WEBHOOK",
  SLACK: "SLACK",
  GITHUB_DISPATCH: "GITHUB_DISPATCH",
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];
export const ActionExecutionStatus = {
  COMPLETED: "COMPLETED",
  ERROR: "ERROR",
  PENDING: "PENDING",
  CANCELLED: "CANCELLED",
} as const;
export type ActionExecutionStatus =
  (typeof ActionExecutionStatus)[keyof typeof ActionExecutionStatus];
export const SurveyName = {
  ORG_ONBOARDING: "org_onboarding",
  USER_ONBOARDING: "user_onboarding",
} as const;
export type SurveyName = (typeof SurveyName)[keyof typeof SurveyName];
export type Account = {
  id: string;
  user_id: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token: string | null;
  access_token: string | null;
  expires_at: number | null;
  expires_in: number | null;
  ext_expires_in: number | null;
  token_type: string | null;
  scope: string | null;
  id_token: string | null;
  session_state: string | null;
  refresh_token_expires_in: number | null;
  created_at: number | null;
};
export type Action = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string;
  type: ActionType;
  config: unknown;
};
export type AnnotationQueue = {
  id: string;
  name: string;
  description: string | null;
  score_config_ids: Generated<string[]>;
  project_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type AnnotationQueueAssignment = {
  id: string;
  project_id: string;
  user_id: string;
  queue_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type AnnotationQueueItem = {
  id: string;
  queue_id: string;
  object_id: string;
  object_type: AnnotationQueueObjectType;
  status: Generated<AnnotationQueueStatus>;
  locked_at: Timestamp | null;
  locked_by_user_id: string | null;
  annotator_user_id: string | null;
  completed_at: Timestamp | null;
  project_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type ApiKey = {
  id: string;
  created_at: Generated<Timestamp>;
  note: string | null;
  public_key: string;
  hashed_secret_key: string;
  fast_hashed_secret_key: string | null;
  display_secret_key: string;
  last_used_at: Timestamp | null;
  expires_at: Timestamp | null;
  project_id: string | null;
  organization_id: string | null;
  scope: Generated<ApiKeyScope>;
};
export type AuditLog = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  type: Generated<AuditLogRecordType>;
  api_key_id: string | null;
  user_id: string | null;
  org_id: string;
  user_org_role: string | null;
  project_id: string | null;
  user_project_role: string | null;
  resource_type: string;
  resource_id: string;
  action: string;
  before: string | null;
  after: string | null;
};
export type Automation = {
  id: string;
  name: string;
  trigger_id: string;
  action_id: string;
  created_at: Generated<Timestamp>;
  project_id: string;
};
export type AutomationExecution = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  source_id: string;
  automation_id: string;
  trigger_id: string;
  action_id: string;
  project_id: string;
  status: Generated<ActionExecutionStatus>;
  input: unknown;
  output: unknown | null;
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
  error: string | null;
};
export type BackgroundMigration = {
  id: string;
  name: string;
  script: string;
  args: unknown;
  state: Generated<unknown>;
  finished_at: Timestamp | null;
  failed_at: Timestamp | null;
  failed_reason: string | null;
  worker_id: string | null;
  locked_at: Timestamp | null;
};
export type BatchAction = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string;
  user_id: string;
  action_type: string;
  table_name: string;
  status: string;
  finished_at: Timestamp | null;
  query: unknown;
  config: unknown | null;
  total_count: number | null;
  processed_count: number | null;
  failed_count: number | null;
  log: string | null;
};
export type BatchExport = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string;
  user_id: string;
  finished_at: Timestamp | null;
  expires_at: Timestamp | null;
  name: string;
  status: string;
  query: unknown;
  format: string;
  url: string | null;
  log: string | null;
};
export type BillingMeterBackup = {
  stripe_customer_id: string;
  meter_id: string;
  start_time: Timestamp;
  end_time: Timestamp;
  aggregated_value: number;
  event_name: string;
  org_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type BlobStorageIntegration = {
  project_id: string;
  type: BlobStorageIntegrationType;
  bucket_name: string;
  prefix: string;
  access_key_id: string | null;
  secret_access_key: string | null;
  region: string;
  endpoint: string | null;
  force_path_style: boolean;
  next_sync_at: Timestamp | null;
  last_sync_at: Timestamp | null;
  enabled: boolean;
  export_frequency: string;
  file_type: Generated<BlobStorageIntegrationFileType>;
  export_mode: Generated<BlobStorageExportMode>;
  export_start_date: Timestamp | null;
  export_source: Generated<AnalyticsIntegrationExportSource>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type CloudSpendAlert = {
  id: string;
  org_id: string;
  title: string;
  threshold: string;
  triggered_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type Comment = {
  id: string;
  project_id: string;
  object_type: CommentObjectType;
  object_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  content: string;
  author_user_id: string | null;
  data_field: string | null;
  path: Generated<string[]>;
  range_start: Generated<number[]>;
  range_end: Generated<number[]>;
};
export type CommentReaction = {
  id: string;
  project_id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at: Generated<Timestamp>;
};
export type CronJobs = {
  name: string;
  last_run: Timestamp | null;
  job_started_at: Timestamp | null;
  state: string | null;
};
export type Dashboard = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  project_id: string | null;
  name: string;
  description: string;
  definition: unknown;
  filters: Generated<unknown>;
};
export type DashboardWidget = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  project_id: string | null;
  name: string;
  description: string;
  view: DashboardWidgetViews;
  dimensions: unknown;
  metrics: unknown;
  filters: unknown;
  chart_type: DashboardWidgetChartType;
  chart_config: unknown;
};
export type Dataset = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  metadata: unknown | null;
  remote_experiment_url: string | null;
  remote_experiment_payload: unknown | null;
  input_schema: unknown | null;
  expected_output_schema: unknown | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type DatasetItem = {
  id: string;
  project_id: string;
  status: Generated<DatasetStatus | null>;
  input: unknown | null;
  expected_output: unknown | null;
  metadata: unknown | null;
  source_trace_id: string | null;
  source_observation_id: string | null;
  dataset_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  valid_from: Generated<Timestamp>;
  valid_to: Timestamp | null;
  is_deleted: Generated<boolean>;
};
export type DatasetRunItems = {
  id: string;
  project_id: string;
  dataset_run_id: string;
  dataset_item_id: string;
  trace_id: string;
  observation_id: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type DatasetRuns = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  metadata: unknown | null;
  dataset_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type DefaultLlmModel = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string;
  llm_api_key_id: string;
  provider: string;
  adapter: string;
  model: string;
  model_params: unknown | null;
};
export type EvalTemplate = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string | null;
  name: string;
  version: number;
  prompt: string;
  partner: string | null;
  model: string | null;
  provider: string | null;
  model_params: unknown | null;
  vars: Generated<string[]>;
  output_schema: unknown;
};
export type JobConfiguration = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string;
  job_type: JobType;
  status: Generated<JobConfigState>;
  eval_template_id: string | null;
  score_name: string;
  filter: unknown;
  target_object: string;
  variable_mapping: unknown;
  sampling: string;
  delay: number;
  time_scope: Generated<string[]>;
};
export type JobExecution = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string;
  job_configuration_id: string;
  job_template_id: string | null;
  status: JobExecutionStatus;
  start_time: Timestamp | null;
  end_time: Timestamp | null;
  error: string | null;
  job_input_trace_id: string | null;
  job_input_trace_timestamp: Timestamp | null;
  job_input_observation_id: string | null;
  job_input_dataset_item_id: string | null;
  job_input_dataset_item_valid_from: Timestamp | null;
  job_output_score_id: string | null;
  execution_trace_id: string | null;
};
export type LegacyPrismaObservation = {
  id: string;
  trace_id: string | null;
  project_id: string;
  type: LegacyPrismaObservationType;
  start_time: Generated<Timestamp>;
  end_time: Timestamp | null;
  name: string | null;
  metadata: unknown | null;
  parent_observation_id: string | null;
  level: Generated<LegacyPrismaObservationLevel>;
  status_message: string | null;
  version: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  model: string | null;
  internal_model: string | null;
  internal_model_id: string | null;
  modelParameters: unknown | null;
  input: unknown | null;
  output: unknown | null;
  prompt_tokens: Generated<number>;
  completion_tokens: Generated<number>;
  total_tokens: Generated<number>;
  unit: string | null;
  input_cost: string | null;
  output_cost: string | null;
  total_cost: string | null;
  calculated_input_cost: string | null;
  calculated_output_cost: string | null;
  calculated_total_cost: string | null;
  completion_start_time: Timestamp | null;
  prompt_id: string | null;
};
export type LegacyPrismaScore = {
  id: string;
  timestamp: Generated<Timestamp>;
  project_id: string;
  name: string;
  value: number | null;
  source: LegacyPrismaScoreSource;
  author_user_id: string | null;
  comment: string | null;
  trace_id: string;
  observation_id: string | null;
  config_id: string | null;
  string_value: string | null;
  queue_id: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  data_type: Generated<ScoreConfigDataType>;
};
export type LegacyPrismaTrace = {
  id: string;
  external_id: string | null;
  timestamp: Generated<Timestamp>;
  name: string | null;
  user_id: string | null;
  metadata: unknown | null;
  release: string | null;
  version: string | null;
  project_id: string;
  public: Generated<boolean>;
  bookmarked: Generated<boolean>;
  tags: Generated<string[]>;
  input: unknown | null;
  output: unknown | null;
  session_id: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type LlmApiKeys = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  provider: string;
  adapter: string;
  display_secret_key: string;
  secret_key: string;
  base_url: string | null;
  custom_models: Generated<string[]>;
  with_default_models: Generated<boolean>;
  extra_headers: string | null;
  extra_header_keys: Generated<string[]>;
  config: unknown | null;
  project_id: string;
};
export type LlmSchema = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string;
  name: string;
  description: string;
  schema: unknown;
};
export type LlmTool = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string;
  name: string;
  description: string;
  parameters: unknown;
};
export type Media = {
  id: string;
  sha_256_hash: string;
  project_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  uploaded_at: Timestamp | null;
  upload_http_status: number | null;
  upload_http_error: string | null;
  bucket_path: string;
  bucket_name: string;
  content_type: string;
  content_length: string;
};
export type MembershipInvitation = {
  id: string;
  email: string;
  org_id: string;
  org_role: Role;
  project_id: string | null;
  project_role: Role | null;
  invited_by_user_id: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type MixpanelIntegration = {
  project_id: string;
  encrypted_mixpanel_project_token: string;
  mixpanel_region: string;
  last_sync_at: Timestamp | null;
  enabled: boolean;
  created_at: Generated<Timestamp>;
  export_source: Generated<AnalyticsIntegrationExportSource>;
};
export type Model = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string | null;
  model_name: string;
  match_pattern: string;
  start_date: Timestamp | null;
  input_price: string | null;
  output_price: string | null;
  total_price: string | null;
  unit: string | null;
  tokenizer_id: string | null;
  tokenizer_config: unknown | null;
};
export type NotificationPreference = {
  id: string;
  user_id: string;
  project_id: string;
  channel: NotificationChannel;
  type: NotificationType;
  enabled: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type ObservationMedia = {
  id: string;
  project_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  media_id: string;
  trace_id: string;
  observation_id: string;
  field: string;
};
export type Organization = {
  id: string;
  name: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  cloud_config: unknown | null;
  metadata: unknown | null;
  cloud_billing_cycle_anchor: Generated<Timestamp | null>;
  cloud_billing_cycle_updated_at: Timestamp | null;
  cloud_current_cycle_usage: number | null;
  cloud_free_tier_usage_threshold_state: string | null;
  ai_features_enabled: Generated<boolean>;
};
export type OrganizationMembership = {
  id: string;
  org_id: string;
  user_id: string;
  role: Role;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type PendingDeletion = {
  id: string;
  project_id: string;
  object: string;
  object_id: string;
  is_deleted: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type PosthogIntegration = {
  project_id: string;
  encrypted_posthog_api_key: string;
  posthog_host_name: string;
  last_sync_at: Timestamp | null;
  enabled: boolean;
  created_at: Generated<Timestamp>;
  export_source: Generated<AnalyticsIntegrationExportSource>;
};
export type Price = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  model_id: string;
  project_id: string | null;
  pricing_tier_id: string;
  usage_type: string;
  price: string;
};
export type PricingTier = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  model_id: string;
  name: string;
  is_default: Generated<boolean>;
  priority: number;
  conditions: unknown;
};
export type Project = {
  id: string;
  org_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
  name: string;
  retention_days: number | null;
  has_traces: Generated<boolean>;
  metadata: unknown | null;
};
export type ProjectMembership = {
  org_membership_id: string;
  project_id: string;
  user_id: string;
  role: Role;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type Prompt = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string;
  created_by: string;
  prompt: unknown;
  name: string;
  version: number;
  type: Generated<string>;
  is_active: boolean | null;
  config: Generated<unknown>;
  tags: Generated<string[]>;
  labels: Generated<string[]>;
  commit_message: string | null;
};
export type PromptDependency = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string;
  parent_id: string;
  child_name: string;
  child_label: string | null;
  child_version: number | null;
};
export type PromptProtectedLabels = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string;
  label: string;
};
export type ScoreConfig = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string;
  name: string;
  data_type: ScoreConfigDataType;
  is_archived: Generated<boolean>;
  min_value: number | null;
  max_value: number | null;
  categories: unknown | null;
  description: string | null;
};
export type Session = {
  id: string;
  session_token: string;
  user_id: string;
  expires: Timestamp;
};
export type SlackIntegration = {
  id: string;
  project_id: string;
  team_id: string;
  team_name: string;
  bot_token: string;
  bot_user_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
};
export type SsoConfig = {
  domain: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  auth_provider: string;
  auth_config: unknown | null;
};
export type Survey = {
  id: string;
  created_at: Generated<Timestamp>;
  survey_name: SurveyName;
  response: unknown;
  user_id: string | null;
  user_email: string | null;
  org_id: string | null;
};
export type TableViewPreset = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string;
  name: string;
  table_name: string;
  created_by: string | null;
  updated_by: string | null;
  filters: unknown;
  column_order: unknown;
  column_visibility: unknown;
  search_query: string | null;
  order_by: unknown | null;
};
export type TraceMedia = {
  id: string;
  project_id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  media_id: string;
  trace_id: string;
  field: string;
};
export type TraceSession = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string;
  bookmarked: Generated<boolean>;
  public: Generated<boolean>;
  environment: Generated<string>;
};
export type Trigger = {
  id: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  project_id: string;
  eventSource: string;
  eventActions: string[];
  filter: unknown | null;
  status: Generated<JobConfigState>;
};
export type User = {
  id: string;
  name: string | null;
  email: string | null;
  email_verified: Timestamp | null;
  password: string | null;
  image: string | null;
  admin: Generated<boolean>;
  v4_beta_enabled: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  feature_flags: Generated<string[]>;
};
export type VerificationToken = {
  identifier: string;
  token: string;
  expires: Timestamp;
};
export type DB = {
  Account: Account;
  actions: Action;
  annotation_queue_assignments: AnnotationQueueAssignment;
  annotation_queue_items: AnnotationQueueItem;
  annotation_queues: AnnotationQueue;
  api_keys: ApiKey;
  audit_logs: AuditLog;
  automation_executions: AutomationExecution;
  automations: Automation;
  background_migrations: BackgroundMigration;
  batch_actions: BatchAction;
  batch_exports: BatchExport;
  billing_meter_backups: BillingMeterBackup;
  blob_storage_integrations: BlobStorageIntegration;
  cloud_spend_alerts: CloudSpendAlert;
  comment_reactions: CommentReaction;
  comments: Comment;
  cron_jobs: CronJobs;
  dashboard_widgets: DashboardWidget;
  dashboards: Dashboard;
  dataset_items: DatasetItem;
  dataset_run_items: DatasetRunItems;
  dataset_runs: DatasetRuns;
  datasets: Dataset;
  default_llm_models: DefaultLlmModel;
  eval_templates: EvalTemplate;
  job_configurations: JobConfiguration;
  job_executions: JobExecution;
  llm_api_keys: LlmApiKeys;
  llm_schemas: LlmSchema;
  llm_tools: LlmTool;
  media: Media;
  membership_invitations: MembershipInvitation;
  mixpanel_integrations: MixpanelIntegration;
  models: Model;
  notification_preferences: NotificationPreference;
  observation_media: ObservationMedia;
  observations: LegacyPrismaObservation;
  organization_memberships: OrganizationMembership;
  organizations: Organization;
  pending_deletions: PendingDeletion;
  posthog_integrations: PosthogIntegration;
  prices: Price;
  pricing_tiers: PricingTier;
  project_memberships: ProjectMembership;
  projects: Project;
  prompt_dependencies: PromptDependency;
  prompt_protected_labels: PromptProtectedLabels;
  prompts: Prompt;
  score_configs: ScoreConfig;
  scores: LegacyPrismaScore;
  Session: Session;
  slack_integrations: SlackIntegration;
  sso_configs: SsoConfig;
  surveys: Survey;
  table_view_presets: TableViewPreset;
  trace_media: TraceMedia;
  trace_sessions: TraceSession;
  traces: LegacyPrismaTrace;
  triggers: Trigger;
  users: User;
  verification_tokens: VerificationToken;
};
