import type { ColumnType } from "kysely";
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export const Role = {
    OWNER: "OWNER",
    ADMIN: "ADMIN",
    MEMBER: "MEMBER",
    VIEWER: "VIEWER",
    NONE: "NONE"
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const ObservationType = {
    SPAN: "SPAN",
    EVENT: "EVENT",
    GENERATION: "GENERATION"
} as const;
export type ObservationType = (typeof ObservationType)[keyof typeof ObservationType];
export const ObservationLevel = {
    DEBUG: "DEBUG",
    DEFAULT: "DEFAULT",
    WARNING: "WARNING",
    ERROR: "ERROR"
} as const;
export type ObservationLevel = (typeof ObservationLevel)[keyof typeof ObservationLevel];
export const ScoreSource = {
    ANNOTATION: "ANNOTATION",
    API: "API",
    EVAL: "EVAL"
} as const;
export type ScoreSource = (typeof ScoreSource)[keyof typeof ScoreSource];
export const ScoreDataType = {
    CATEGORICAL: "CATEGORICAL",
    NUMERIC: "NUMERIC",
    BOOLEAN: "BOOLEAN"
} as const;
export type ScoreDataType = (typeof ScoreDataType)[keyof typeof ScoreDataType];
export const DatasetStatus = {
    ACTIVE: "ACTIVE",
    ARCHIVED: "ARCHIVED"
} as const;
export type DatasetStatus = (typeof DatasetStatus)[keyof typeof DatasetStatus];
export const CommentObjectType = {
    TRACE: "TRACE",
    OBSERVATION: "OBSERVATION",
    SESSION: "SESSION",
    PROMPT: "PROMPT"
} as const;
export type CommentObjectType = (typeof CommentObjectType)[keyof typeof CommentObjectType];
export const JobType = {
    EVAL: "EVAL"
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];
export const JobConfigState = {
    ACTIVE: "ACTIVE",
    INACTIVE: "INACTIVE"
} as const;
export type JobConfigState = (typeof JobConfigState)[keyof typeof JobConfigState];
export const JobExecutionStatus = {
    COMPLETED: "COMPLETED",
    ERROR: "ERROR",
    PENDING: "PENDING",
    CANCELLED: "CANCELLED"
} as const;
export type JobExecutionStatus = (typeof JobExecutionStatus)[keyof typeof JobExecutionStatus];
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
    project_id: string;
};
export type AuditLog = {
    id: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
    user_id: string;
    org_id: string;
    user_org_role: string;
    project_id: string | null;
    user_project_role: string | null;
    resource_type: string;
    resource_id: string;
    action: string;
    before: string | null;
    after: string | null;
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
export type Comment = {
    id: string;
    project_id: string;
    object_type: CommentObjectType;
    object_id: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
    content: string;
    author_user_id: string | null;
};
export type CronJobs = {
    name: string;
    last_run: Timestamp | null;
    job_started_at: Timestamp | null;
    state: string | null;
};
export type Dataset = {
    id: string;
    project_id: string;
    name: string;
    description: string | null;
    metadata: unknown | null;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
};
export type DatasetItem = {
    id: string;
    project_id: string;
    status: Generated<DatasetStatus>;
    input: unknown | null;
    expected_output: unknown | null;
    metadata: unknown | null;
    source_trace_id: string | null;
    source_observation_id: string | null;
    dataset_id: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
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
export type EvalTemplate = {
    id: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
    project_id: string;
    name: string;
    version: number;
    prompt: string;
    model: string;
    provider: string;
    model_params: unknown;
    vars: Generated<string[]>;
    output_schema: unknown;
};
export type Events = {
    id: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
    project_id: string;
    data: unknown;
    headers: Generated<unknown>;
    url: string | null;
    method: string | null;
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
};
export type JobExecution = {
    id: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
    project_id: string;
    job_configuration_id: string;
    status: JobExecutionStatus;
    start_time: Timestamp | null;
    end_time: Timestamp | null;
    error: string | null;
    job_input_trace_id: string | null;
    job_output_score_id: string | null;
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
    project_id: string;
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
    unit: string;
    tokenizer_id: string | null;
    tokenizer_config: unknown | null;
};
export type Observation = {
    id: string;
    trace_id: string | null;
    project_id: string;
    type: ObservationType;
    start_time: Generated<Timestamp>;
    end_time: Timestamp | null;
    name: string | null;
    metadata: unknown | null;
    parent_observation_id: string | null;
    level: Generated<ObservationLevel>;
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
export type ObservationView = {
    id: string;
    trace_id: string | null;
    project_id: string;
    type: ObservationType;
    start_time: Timestamp;
    end_time: Timestamp | null;
    name: string | null;
    metadata: unknown | null;
    parent_observation_id: string | null;
    level: Generated<ObservationLevel>;
    status_message: string | null;
    version: string | null;
    created_at: Timestamp;
    updated_at: Timestamp;
    model: string | null;
    modelParameters: unknown | null;
    input: unknown | null;
    output: unknown | null;
    prompt_tokens: Generated<number>;
    completion_tokens: Generated<number>;
    total_tokens: Generated<number>;
    unit: string | null;
    completion_start_time: Timestamp | null;
    prompt_id: string | null;
    prompt_name: string | null;
    prompt_version: number | null;
    model_id: string | null;
    input_price: string | null;
    output_price: string | null;
    total_price: string | null;
    calculated_input_cost: string | null;
    calculated_output_cost: string | null;
    calculated_total_cost: string | null;
    latency: number | null;
    time_to_first_token: number | null;
};
export type Organization = {
    id: string;
    name: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
    cloud_config: unknown | null;
};
export type OrganizationMembership = {
    id: string;
    org_id: string;
    user_id: string;
    role: Role;
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
};
export type Project = {
    id: string;
    org_id: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
    name: string;
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
};
export type Score = {
    id: string;
    timestamp: Generated<Timestamp>;
    project_id: string;
    name: string;
    value: number | null;
    source: ScoreSource;
    author_user_id: string | null;
    comment: string | null;
    trace_id: string;
    observation_id: string | null;
    config_id: string | null;
    string_value: string | null;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
    data_type: Generated<ScoreDataType>;
};
export type ScoreConfig = {
    id: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
    project_id: string;
    name: string;
    data_type: ScoreDataType;
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
export type SsoConfig = {
    domain: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
    auth_provider: string;
    auth_config: unknown | null;
};
export type Trace = {
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
export type TraceSession = {
    id: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
    project_id: string;
    bookmarked: Generated<boolean>;
    public: Generated<boolean>;
};
export type TraceView = {
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
    created_at: Timestamp;
    updated_at: Timestamp;
    duration: number | null;
};
export type User = {
    id: string;
    name: string | null;
    email: string | null;
    email_verified: Timestamp | null;
    password: string | null;
    image: string | null;
    admin: Generated<boolean>;
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
    api_keys: ApiKey;
    audit_logs: AuditLog;
    batch_exports: BatchExport;
    comments: Comment;
    cron_jobs: CronJobs;
    dataset_items: DatasetItem;
    dataset_run_items: DatasetRunItems;
    dataset_runs: DatasetRuns;
    datasets: Dataset;
    eval_templates: EvalTemplate;
    events: Events;
    job_configurations: JobConfiguration;
    job_executions: JobExecution;
    llm_api_keys: LlmApiKeys;
    membership_invitations: MembershipInvitation;
    models: Model;
    observations: Observation;
    observations_view: ObservationView;
    organization_memberships: OrganizationMembership;
    organizations: Organization;
    posthog_integrations: PosthogIntegration;
    project_memberships: ProjectMembership;
    projects: Project;
    prompts: Prompt;
    score_configs: ScoreConfig;
    scores: Score;
    Session: Session;
    sso_configs: SsoConfig;
    trace_sessions: TraceSession;
    traces: Trace;
    traces_view: TraceView;
    users: User;
    verification_tokens: VerificationToken;
};
