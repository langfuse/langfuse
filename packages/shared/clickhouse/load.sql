-- traces
INSERT INTO traces
SELECT toString(floor(randUniform(0, 200000000))) AS id,
  now() - randUniform(0, 10000000) AS `timestamp`,
  concat('name_', toString(rand() % 100)) AS `name`,
  concat('user_id_', toString(rand() % 10000)) AS `user_id`,
  map('key', 'value') AS metadata,
  concat('release_', toString(rand() % 10000)) AS `release`,
  concat('version_', toString(rand() % 10000)) AS `version`,
  concat('project_id_', toString(floor(randExponential(1 / 2)) % 1000)) AS project_id,
  if(rand() < 0.8, true, false) as public,
  if(rand() < 0.8, true, false) as bookmarked,
  array('tag1', 'tag2') as tags,
  repeat('input', toInt64(randExponential(1 / 100))) AS `input`,
  repeat('output', toInt64(randExponential(1 / 100))) AS `output`,
  concat('session_', toString(rand() % 100)) AS `session_id`,
  `timestamp` AS `created_at`
FROM numbers(1000000);
-- observations
INSERT INTO observations
SELECT toString(floor(randUniform(0, 1000000000))) AS id,
  toString(floor(randUniform(0, 2000000))) AS trace_id,
  concat('project_id_', toString(floor(randExponential(1 / 2)) % 1000)) AS project_id,
  multiIf(
    randUniform(0,1) < 0.4,
    'SPAN',
    randUniform(0,1) < 0.8,
    'GENERATION',
    'EVENT'
  ) AS `type`,
  toString(rand()) AS `parent_observation_id`,
  now() - randUniform(0, 10000000) AS `start_time`,
  addSeconds(start_time, floor(randExponential(1 / 10))) AS `end_time`,
  concat('name', toString(rand() % 100)) AS `name`,
  map('key', 'value') AS metadata,
  'level' AS `level`,
  'status_message' AS `status_message`,
  'version' AS `version`,
  repeat('input', toInt64(randExponential(1 / 100))) AS `input`,
  repeat('output', toInt64(randExponential(1 / 100))) AS `output`,
  if(
    number % 2 = 0,
    'claude-3-haiku-20240307',
    'gpt-4'
  ) as `model`,
  if(
    number % 2 = 0,
    'claude-3-haiku-20240307',
    'gpt-4'
  ) as `internal_model`,
  'model_parameters' AS `model_parameters`,
  toInt32(rand() % 1000) AS `input_usage`,
  toInt32(rand() % 1000) AS `output_usage`,
  toInt32(rand() % 1000) AS `total_usage`,
  'unit' AS `unit`,
  rand64() AS `input_cost`,
  rand64() AS `output_cost`,
  rand64() AS `total_cost`,
  start_time AS `completion_start_time`,
  toString(rand()) AS `prompt_id`,
  start_time AS `created_at`
FROM numbers(1000000);
-- scores
INSERT INTO scores
SELECT toString(floor(randUniform(0, 50000000))) AS id,
   now() - randUniform(0, 10000000) AS `timestamp`,
  concat('project_id_', toString(floor(randExponential(1 / 2)) % 1000)) AS project_id,
  concat('name_', toString(rand() % 100)) AS `name`,
  randUniform(0, 100) as `value`,
  toString(floor(randUniform(0, 2000000))) AS trace_id,
  'API' as source,
  if(
    rand() > 0.9,
     toString(floor(randUniform(0, 10000000))),
    NULL
  ) AS observation_id,
  'comment' as comment,
  `timestamp` AS created_at
FROM numbers(1000000);