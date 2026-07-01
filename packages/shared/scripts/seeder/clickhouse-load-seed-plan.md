# ClickHouse Load-Seed Plan — `traces` & `observations`

Working notes for generating realistic, *cheaply parameterizable* seed data
for a load test against ClickHouse. The goal is two `INSERT INTO ... SELECT
FROM numbers(N)` statements — one per table — that can be invoked repeatedly
in batches to drive sustained write load against multiple `project_id`s.

## Goals & constraints

- One INSERT per table (`traces`, `observations`); no per-row Node code path.
- Configurable knobs (passed in via CTE constants — see §3):
  - **Volume**: total rows per batch, batches per second, day-spread.
  - **Cardinality buckets**: `version`, `release`, `environment`, `name`,
    `level` — pick-from-set of 3–5.
  - **High-cardinality strings**: `user_id`, `session_id`, `trace_id`,
    `id` — pool size param so we can dial repetition.
  - **Project distribution**: static array of `project_id`s; rows are
    bucketed into them so multiple projects appear in one INSERT.
  - **Length distribution** for `input` / `output` / `metadata`: control
    via `p95_bytes` and `max_bytes` (50 MiB cap). Body is built by
    repeating an ASCII fragment and slicing to the chosen length.
  - **Heavy-metadata fraction**: e.g. 5 % of rows get one or two map
    entries with very large values.
- Trace↔observation correlation: deterministic IDs so observations
  reference real traces without a join.
- No prerequisite postgres state — load test runs purely against CH.
- Keep it idempotent enough that re-running with the same `BATCH_NO`
  doesn't blow up (use `id` derived from `(BATCH_NO, number)` so re-runs
  collide and ReplacingMergeTree dedupes on `id`).

## Final SQL — `traces`

```sql
INSERT INTO traces
WITH
  toUInt64({{ROW_COUNT}})     AS row_count,
  toUInt32({{DAY_WINDOW}})    AS day_window,
  toUInt64({{BATCH_NO}})      AS batch_no,
  ['v1.0','v1.1','v2.0','v2.1','v3.0']    AS versions,
  ['stable','canary','rc','nightly']      AS releases,
  ['default','staging','prod','eu-prod']  AS envs,
  ['proj-load-a','proj-load-b','proj-load-c','proj-load-d'] AS projects,
  toUInt64(50000)             AS user_pool_size,
  toUInt64(10000)             AS session_pool_size,
  toUInt64(2000)              AS name_pool_size,
  toUInt64(2048)              AS p95_bytes,
  toUInt64(50 * 1024 * 1024)  AS max_bytes,
  toUInt8(5)                  AS large_pct,
  toUInt8(5)                  AS heavy_meta_pct,
  toUInt64(1024 * 1024)       AS heavy_meta_bytes
SELECT
  concat('trace-', toString(batch_no), '-', toString(number))           AS id,
  toDateTime64(now() - randUniform(0, day_window * 86400), 3)           AS timestamp,
  concat('trace-name-', toString(rand() % name_pool_size))              AS name,
  if(rand() % 100 < 70,
     concat('user-', toString(cityHash64(rand64()) % user_pool_size)),
     NULL)                                                              AS user_id,
  multiIf(
    (rand() % 100) < heavy_meta_pct,
    map('big_payload', randomPrintableASCII(heavy_meta_bytes),
        'kind',        'oversized'),
    map('env',    envs[1 + (rand() % length(envs))],
        'tenant', concat('t-', toString(rand() % 200)),
        'region', arrayElement(['us-east','eu-west','ap-south'], 1 + (rand() % 3)))
  )                                                                     AS metadata,
  releases[1 + (rand() % length(releases))]                             AS release,
  versions[1 + (rand() % length(versions))]                             AS version,
  projects[1 + (number % length(projects))]                             AS project_id,
  envs[1 + (rand() % length(envs))]                                     AS environment,
  rand() % 10 < 8                                                       AS public,
  rand() % 10 < 1                                                       AS bookmarked,
  if(rand() % 10 < 3, ['production','ai-agent'], [])                    AS tags,
  randomPrintableASCII(
    multiIf((rand() % 100) < (100 - large_pct),
            toUInt64(64) + (rand64() % (p95_bytes - 64)),
            p95_bytes + (rand64() % (max_bytes - p95_bytes)))
  )                                                                     AS input,
  randomPrintableASCII(
    multiIf((rand() % 100) < (100 - large_pct),
            toUInt64(64) + (rand64() % (p95_bytes - 64)),
            p95_bytes + (rand64() % (max_bytes - p95_bytes)))
  )                                                                     AS output,
  if(rand() % 100 < 60,
     concat('sess-', toString(cityHash64(rand64()) % session_pool_size)),
     NULL)                                                              AS session_id,
  now()                                                                 AS created_at,
  now()                                                                 AS updated_at,
  now()                                                                 AS event_ts,
  toUInt8(0)                                                            AS is_deleted
FROM numbers(row_count)
SETTINGS
  max_block_size              = 256;
```

## Final SQL — `observations`

```sql
INSERT INTO observations
WITH
  toUInt64({{ROW_COUNT}})                  AS row_count,           -- e.g. 5x trace rows
  toUInt32({{DAY_WINDOW}})                 AS day_window,
  toUInt64({{BATCH_NO}})                   AS batch_no,
  toUInt64({{TRACES_IN_BATCH}})            AS traces_in_batch,
  toUInt8({{OBS_PER_TRACE}})               AS obs_per_trace,       -- typical fanout
  ['default','staging','prod','eu-prod']                AS envs,
  ['DEFAULT','DEBUG','WARNING','ERROR']                 AS levels,
  ['GENERATION','SPAN','EVENT','AGENT','TOOL']          AS obs_types,
  ['gpt-4o','gpt-4o-mini','claude-sonnet-4','claude-haiku-4','gemini-2.0'] AS models,
  ['v1.0','v1.1','v2.0']                                AS versions,
  ['proj-load-a','proj-load-b','proj-load-c','proj-load-d'] AS projects,
  toUInt64(2048)                AS p95_bytes,
  toUInt64(50 * 1024 * 1024)    AS max_bytes,
  toUInt8(5)                    AS large_pct,
  toUInt8(5)                    AS heavy_meta_pct,
  toUInt64(1024 * 1024)         AS heavy_meta_bytes,
  toUInt64(2000)                AS name_pool_size
SELECT
  concat('obs-', toString(batch_no), '-', toString(number))             AS id,
  -- trace_id derived from the same (batch_no, number/obs_per_trace) scheme
  concat('trace-', toString(batch_no),
         '-', toString(intDiv(number, obs_per_trace) % traces_in_batch)) AS trace_id,
  -- project_id must match the parent trace
  projects[1 + ((intDiv(number, obs_per_trace) % traces_in_batch) % length(projects))] AS project_id,
  envs[1 + (rand() % length(envs))]                                     AS environment,
  obs_types[1 + (rand() % length(obs_types))]                           AS type,
  if(number % obs_per_trace = 0, NULL,
     concat('obs-', toString(batch_no), '-', toString(number - 1)))     AS parent_observation_id,
  toDateTime64(now() - randUniform(0, day_window * 86400), 3)           AS start_time,
  addMilliseconds(start_time, toInt64(randUniform(50, 5000)))           AS end_time,
  concat('obs-name-', toString(rand() % name_pool_size))                AS name,
  multiIf(
    (rand() % 100) < heavy_meta_pct,
    map('big_payload', randomPrintableASCII(heavy_meta_bytes),
        'kind',        'oversized'),
    map('step', toString(number % obs_per_trace),
        'env',  envs[1 + (rand() % length(envs))])
  )                                                                     AS metadata,
  levels[1 + (rand() % length(levels))]                                 AS level,
  if(rand() % 100 < 5, 'failed downstream call', NULL)                  AS status_message,
  versions[1 + (rand() % length(versions))]                             AS version,
  -- input/output: gate on type, same length distribution as traces
  if(type IN ('GENERATION','EMBEDDING','TOOL'),
     randomPrintableASCII(
       multiIf((rand() % 100) < (100 - large_pct),
               toUInt64(64) + (rand64() % (p95_bytes - 64)),
               p95_bytes + (rand64() % (max_bytes - p95_bytes)))),
     NULL)                                                              AS input,
  if(type IN ('GENERATION','EMBEDDING','TOOL','RETRIEVER','EVALUATOR'),
     randomPrintableASCII(
       multiIf((rand() % 100) < (100 - large_pct),
               toUInt64(64) + (rand64() % (p95_bytes - 64)),
               p95_bytes + (rand64() % (max_bytes - p95_bytes)))),
     NULL)                                                              AS output,
  if(type = 'GENERATION', models[1 + (rand() % length(models))], NULL)  AS provided_model_name,
  if(type = 'GENERATION', concat('model-', toString(rand() % 50)), NULL) AS internal_model_id,
  if(type = 'GENERATION', '{"temperature":0.7,"max_tokens":2000}', NULL) AS model_parameters,
  if(type = 'GENERATION',
     map('input',  toUInt64(randUniform(20, 4000)),
         'output', toUInt64(randUniform(10, 2000)),
         'total',  toUInt64(randUniform(30, 6000))),
     map())                                                             AS provided_usage_details,
  if(type = 'GENERATION',
     map('input',  toUInt64(randUniform(20, 4000)),
         'output', toUInt64(randUniform(10, 2000)),
         'total',  toUInt64(randUniform(30, 6000))),
     map())                                                             AS usage_details,
  if(type = 'GENERATION',
     map('input',  toDecimal64(randUniform(0.00001, 0.005), 12),
         'output', toDecimal64(randUniform(0.00001, 0.01),  12),
         'total',  toDecimal64(randUniform(0.00002, 0.015), 12)),
     map())                                                             AS provided_cost_details,
  if(type = 'GENERATION',
     map('input',  toDecimal64(randUniform(0.00001, 0.005), 12),
         'output', toDecimal64(randUniform(0.00001, 0.01),  12),
         'total',  toDecimal64(randUniform(0.00002, 0.015), 12)),
     map())                                                             AS cost_details,
  if(type = 'GENERATION', toDecimal64(randUniform(0.00002, 0.015), 12), NULL) AS total_cost,
  if(type = 'GENERATION', addMilliseconds(start_time, toInt64(randUniform(50, 500))), NULL) AS completion_start_time,
  NULL                                                                  AS prompt_id,
  NULL                                                                  AS prompt_name,
  NULL                                                                  AS prompt_version,
  start_time                                                            AS created_at,
  start_time                                                            AS updated_at,
  start_time                                                            AS event_ts,
  toUInt8(0)                                                            AS is_deleted,
  ''                                                                    AS usage_pricing_tier_id,
  ''                                                                    AS usage_pricing_tier_name,
  map()                                                                 AS tool_definitions,
  []                                                                    AS tool_calls,
  []                                                                    AS tool_call_names
FROM numbers(row_count)
SETTINGS
  max_block_size              = 256;
```

## Sanity-check queries

After a batch lands, these should all return numbers in the expected shape:

```sql
-- length distribution per project
SELECT
  project_id,
  quantile(0.50)(length(input)) p50,
  quantile(0.95)(length(input)) p95,
  quantile(0.99)(length(input)) p99,
  max(length(input))            mx
FROM traces FINAL
WHERE timestamp > now() - INTERVAL 1 DAY
GROUP BY project_id;

-- heavy-metadata fraction (should be ~5 %)
SELECT
  countIf(arrayExists(v -> length(v) > 100000, mapValues(metadata))) / count() AS heavy_frac
FROM traces FINAL
WHERE timestamp > now() - INTERVAL 1 DAY;

-- orphan check: every observation should resolve to a trace
SELECT count()
FROM observations o LEFT ANY JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id
WHERE o.start_time > now() - INTERVAL 1 DAY AND t.id = '';
```
