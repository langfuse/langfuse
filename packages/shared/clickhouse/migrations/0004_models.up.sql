CREATE TABLE models (
    id String,
    created_at DateTime,
    updated_at DateTime,
    project_id Nullable(String),
    model_name String,
    match_pattern String,
    start_date Nullable(DateTime),
    input_price Nullable(Decimal64(4)),
    output_price Nullable(Decimal64(4)),
    total_price Nullable(Decimal64(4)),
    unit String,
    tokenizer_id Nullable(String),
    tokenizer_config Nullable(String)
) ENGINE = ReplacingMergeTree()
ORDER BY (model_name, id);