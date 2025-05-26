-- GreptimeDB DDL for traces table
CREATE TABLE traces (
    id STRING,
    timestamp TIMESTAMP(3) TIME INDEX,
    name STRING TAG,
    user_id STRING TAG,
    metadata STRING, -- Was Map(LowCardinality(String), String)
    release STRING TAG,
    version STRING TAG,
    project_id STRING TAG,
    public BOOLEAN,
    bookmarked BOOLEAN,
    tags STRING, -- Was Array(String)
    input STRING,
    output STRING,
    session_id STRING,
    created_at TIMESTAMP(3) DEFAULT now(),
    updated_at TIMESTAMP(3) DEFAULT now()
    -- No explicit PRIMARY KEY clause; TIME INDEX and TAGs define it
    -- No ENGINE, PARTITION BY, ORDER BY clauses
);

-- GreptimeDB DDL for observations table
CREATE TABLE observations (
    id STRING,
    trace_id STRING TAG,
    project_id STRING TAG,
    type STRING TAG,
    parent_observation_id STRING TAG,
    start_time TIMESTAMP(3) TIME INDEX,
    end_time TIMESTAMP(3),
    name STRING,
    metadata STRING, -- Was Map(LowCardinality(String), String)
    level STRING TAG,
    status_message STRING,
    version STRING, -- Nullable(String) in CH
    input STRING,
    output STRING,
    provided_model_name STRING TAG,
    internal_model_id STRING TAG,
    model_parameters STRING,
    provided_usage_details STRING, -- Was Map(LowCardinality(String), UInt64)
    usage_details STRING, -- Was Map(LowCardinality(String), UInt64)
    provided_cost_details STRING, -- Was Map(LowCardinality(String), Decimal64(12))
    cost_details STRING, -- Was Map(LowCardinality(String), Decimal64(12))
    total_cost FLOAT64, -- Was Nullable(Decimal64(12))
    completion_start_time TIMESTAMP(3),
    prompt_id STRING TAG,
    prompt_name STRING, -- Nullable(String) in CH
    prompt_version UINT16, -- Nullable(UInt16) in CH
    created_at TIMESTAMP(3) DEFAULT now(),
    updated_at TIMESTAMP(3) DEFAULT now()
    -- No explicit PRIMARY KEY clause; TIME INDEX and TAGs define it
    -- No ENGINE, PARTITION BY, ORDER BY clauses
);

-- GreptimeDB DDL for scores table
CREATE TABLE scores (
    id STRING,
    timestamp TIMESTAMP(3) TIME INDEX,
    project_id STRING TAG,
    trace_id STRING TAG,
    observation_id STRING TAG, -- Nullable(String) in CH
    name STRING TAG,
    value FLOAT64,
    source STRING TAG,
    comment STRING,
    author_user_id STRING TAG, -- Nullable(String) in CH
    config_id STRING TAG, -- Nullable(String) in CH
    data_type STRING TAG,
    string_value STRING,
    queue_id STRING TAG, -- Nullable(String) in CH
    created_at TIMESTAMP(3) DEFAULT now(),
    updated_at TIMESTAMP(3) DEFAULT now()
    -- No explicit PRIMARY KEY clause; TIME INDEX and TAGs define it
    -- No ENGINE, PARTITION BY, ORDER BY clauses
);
