INSERT INTO langfuse.observations_raw
SELECT toString(floor(randUniform(0, 500000))) AS id,
  toString(floor(randExponential(1 / 2)) % 1000) AS trace_id,
  toString(floor(randExponential(1 / 2)) % 1000) AS project_id,
  multiIf(
    rand() < 0.8,
    'SPAN',
    rand() < 0.95,
    'GENERATION',
    'EVENT'
  ) AS `type`,
  toString(rand()) AS `parent_observation_id`,
  addYears(now(), -1) + number AS `created_at`,
  addHours(addYears(now(), -1), number * 1) AS `start_time`,
  addSeconds(start_time, floor(randExponential(1 / 10))) AS `end_time`,
  concat('name', toString(rand() % 100)) AS `name`,
  map('key', 'value') AS metadata,
  'level' AS `level`,
  'status_message' AS `status_message`,
  'version' AS `version`,
  repeat('input', toInt64(randExponential(1 / 100))) AS `input`,
  repeat('output', toInt64(randExponential(1 / 100))) AS `output`,
  toString(rand() % 1000) AS `model`,
  'internal_model' AS `internal_model`,
  'model_parameters' AS `model_parameters`,
  toInt32(rand() % 1000) AS `prompt_tokens`,
  toInt32(rand() % 1000) AS `completion_tokens`,
  toInt32(rand() % 1000) AS `total_tokens`,
  'unit' AS `unit`,
  rand64() AS `input_cost`,
  rand64() AS `output_cost`,
  rand64() AS `total_cost`,
  addYears(now(), -1) AS `completion_start_time`,
  toString(rand()) AS `prompt_id`,
  now() AS event_ts,
  randUniform(0, 1000000) AS event_microseconds
FROM numbers(100000);


select count(*) from observations;
select count(*) from observations_view;



CREATE VIEW observations_view AS
SELECT id,
    project_id,
    argMaxMerge(`trace_id`) AS `trace_id`,
    argMaxMerge(`type`) AS `type`,
    argMaxMerge(
        `parent_observation_id`
    ) AS `parent_observation_id`,
    argMaxMerge(`created_at`) AS `created_at`,
    argMaxMerge(
        if(start_time != '', start_time, NULL)
    ) AS `start_time`,
    argMaxMerge(`end_time`) AS `end_time`,
    argMaxMerge(
        if(`name` != '', `name`, NULL)
    ) AS `name`,
    argMaxMerge(metadata) AS metadata,
    argMaxMerge(`level`) AS `level`,
    argMaxMerge(`status_message`) AS `status_message`,
    argMaxMerge(`version`) AS `version`,
    argMaxMerge(`input`) AS `input`,
    argMaxMerge(`output`) AS `output`,
    argMaxMerge(`model`) AS `model`,
    argMaxMerge(`internal_model`) AS `internal_model`,
    argMaxMerge(
        `model_parameters`
    ) AS `model_parameters`,
    argMaxMerge(`prompt_tokens`) AS `prompt_tokens`,
    argMaxMerge(
        `completion_tokens`
    ) AS `completion_tokens`,
    argMaxMerge(`total_tokens`) AS `total_tokens`,
    argMaxMerge(`unit`) AS `unit`,
    argMaxMerge(`input_cost`) AS `input_cost`,
    argMaxMerge(`output_cost`) AS `output_cost`,
    argMaxMerge(`total_cost`) AS `total_cost`,
    argMaxMerge(
        `completion_start_time`
    ) AS `completion_start_time`,
    argMaxMerge(`prompt_id`) AS `prompt_id`
    FROM langfuse.observations
GROUP BY id, project_id