SELECT rule AS rule_id, project_id, facet_id, facet_version, trace_id, session_id, environment, trace_name, unit_start_time,
  processed_at AS summary_processed_at, run AS clustering_run_id,
  if(out, '', concat('tp-', substring(facet_id, 3, 6), '-', toString(t))) AS topic_id,
  if(out, '', concat('tv-', substring(facet_id, 3, 6), '-', toString(t), '-', toString(intDiv(toRelativeDayNum(run_day), 5)))) AS topic_version_id,
  if(out, NULL, toFloat32((r % 1000) / 2000.)) AS distance, toFloat32((r % 997) / 1500.) AS runner_up_distance,
  CAST(origin AS Enum8('initial' = 1, 'online' = 2)) AS origin, coords AS coordinates, assigned AS assigned_at
FROM (
  SELECT *, cityHash64(unit_hash, rule, run) AS r,
    toUInt32(floor(50 * pow(((intDiv(unit_hash, 7) % 10000) / 10000.), 2))) AS t
  FROM (
    -- online: every complete summary placed on arrival into each matching rule's current run (the run of its day)
    SELECT project_id, facet_id, facet_version, trace_id, session_id, environment, trace_name, unit_start_time, processed_at, unit_hash,
      rule, toDate(unit_start_time) AS run_day, concat('run-', rule, '-', facet_id, '-', toString(run_day)) AS run,
      'online' AS origin, CAST([] AS Array(Float32)) AS coords, processed_at + toIntervalSecond(1) AS assigned,
      cityHash64(unit_hash, rule) % 100 < 15 AS out
    FROM topics_schema_exp.sum_A ARRAY JOIN rule_ids AS rule
    WHERE project_id = {p:String} AND toDate(unit_start_time) = {d:Date} AND processing_state = 'complete'
    UNION ALL
    -- initial: the night-{d} refit clusters a stable hash sample of up to 100k summaries per rule and facet from the previous 30 days
    SELECT s.project_id, s.facet_id, facet_version, trace_id, session_id, environment, trace_name, unit_start_time, processed_at, unit_hash,
      rule, {d:Date} AS run_day, concat('run-', rule, '-', s.facet_id, '-', toString({d:Date})) AS run,
      'initial' AS origin, [toFloat32((unit_hash % 100000) / 100000.), toFloat32((intDiv(unit_hash, 100000) % 100000) / 100000.)] AS coords,
      toDateTime64({d:Date}, 3) + toIntervalHour(2) AS assigned, cityHash64(unit_hash, rule, 'fit') % 100 < 25 AS out
    FROM topics_schema_exp.sum_A AS s ARRAY JOIN rule_ids AS rule
    INNER JOIN topics_schema_exp.map_counts AS c ON c.project_id = s.project_id AND c.facet_id = s.facet_id AND c.rule = rule
    WHERE s.project_id = {p:String} AND unit_start_time >= toDateTime64({d:Date}, 3) - INTERVAL 30 DAY AND unit_start_time < toDateTime64({d:Date}, 3)
      AND processing_state = 'complete'
      AND unit_hash < toUInt64(least(1., 100000. / (c.per_day * least(30, dateDiff('day', toDate('2026-10-04'), {d:Date})))) * 18446744073709551615)
  )
)
