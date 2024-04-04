import type { ColumnType } from "kysely";
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export const MembershipRole = {
    OWNER: "OWNER",
    ADMIN: "ADMIN",
    MEMBER: "MEMBER",
    VIEWER: "VIEWER"
} as const;
export type MembershipRole = (typeof MembershipRole)[keyof typeof MembershipRole];
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
    API: "API",
    REVIEW: "REVIEW"
} as const;
export type ScoreSource = (typeof ScoreSource)[keyof typeof ScoreSource];
export const PricingUnit = {
    PER_1000_TOKENS: "PER_1000_TOKENS",
    PER_1000_CHARS: "PER_1000_CHARS"
} as const;
export type PricingUnit = (typeof PricingUnit)[keyof typeof PricingUnit];
export const TokenType = {
    PROMPT: "PROMPT",
    COMPLETION: "COMPLETION",
    TOTAL: "TOTAL"
} as const;
export type TokenType = (typeof TokenType)[keyof typeof TokenType];
export const DatasetStatus = {
    ACTIVE: "ACTIVE",
    ARCHIVED: "ARCHIVED"
} as const;
export type DatasetStatus = (typeof DatasetStatus)[keyof typeof DatasetStatus];
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
    project_id: string;
    user_project_role: MembershipRole;
    resource_type: string;
    resource_id: string;
    action: string;
    before: string | null;
    after: string | null;
};
export type CronJobs = {
    name: string;
    last_run: Timestamp | null;
    job_started_at: Timestamp | null;
    state: string | null;
};
export type Dataset = {
    id: string;
    name: string;
    project_id: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
};
export type DatasetItem = {
    id: string;
    status: Generated<DatasetStatus>;
    input: unknown;
    expected_output: unknown | null;
    source_observation_id: string | null;
    dataset_id: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
};
export type DatasetRunItems = {
    id: string;
    dataset_run_id: string;
    dataset_item_id: string;
    trace_id: string;
    observation_id: string | null;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
};
export type DatasetRuns = {
    id: string;
    name: string;
    metadata: unknown | null;
    dataset_id: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
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
export type Membership = {
    project_id: string;
    user_id: string;
    role: MembershipRole;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
};
export type MembershipInvitation = {
    id: string;
    email: string;
    role: MembershipRole;
    project_id: string;
    sender_id: string | null;
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
    model: string | null;
    internal_model: string | null;
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
    completion_start_time: Timestamp | null;
    prompt_id: string | null;
};
export type ObservationView = {
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
    model_id: string | null;
    input_price: string | null;
    output_price: string | null;
    total_price: string | null;
    calculated_input_cost: string | null;
    calculated_output_cost: string | null;
    calculated_total_cost: string | null;
    latency: number | null;
};
export type Pricing = {
    id: string;
    model_name: string;
    pricing_unit: Generated<PricingUnit>;
    price: string;
    currency: Generated<string>;
    token_type: TokenType;
};
export type Project = {
    id: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
    name: string;
    cloud_config: unknown | null;
};
export type Prompt = {
    id: string;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
    project_id: string;
    created_by: string;
    prompt: string;
    name: string;
    version: number;
    is_active: boolean;
    config: Generated<unknown>;
};
export type Score = {
    id: string;
    timestamp: Generated<Timestamp>;
    name: string;
    value: number;
    source: ScoreSource;
    comment: string | null;
    trace_id: string;
    observation_id: string | null;
};
export type Session = {
    id: string;
    session_token: string;
    user_id: string;
    expires: Timestamp;
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
    cron_jobs: CronJobs;
    dataset_items: DatasetItem;
    dataset_run_items: DatasetRunItems;
    dataset_runs: DatasetRuns;
    datasets: Dataset;
    events: Events;
    membership_invitations: MembershipInvitation;
    memberships: Membership;
    models: Model;
    observations: Observation;
    observations_view: ObservationView;
    pricings: Pricing;
    projects: Project;
    prompts: Prompt;
    scores: Score;
    Session: Session;
    trace_sessions: TraceSession;
    traces: Trace;
    traces_view: TraceView;
    users: User;
    verification_tokens: VerificationToken;
};
