CREATE VIEW IF NOT EXISTS topics_schema_exp.gen_window AS
WITH (SELECT groupArray(summary) FROM topics_schema_exp.pool) AS pool,
     ['chat-completion','rag-answer','support-agent','sql-agent','summarize-ticket','classify-intent','code-review','email-draft','search','onboarding-bot','planner','tool-router'] AS names
SELECT
  p AS project_id,
  concat('cm', substring(lower(hex(cityHash64(p, fk))), 1, 16), 'fct', fk) AS facet_id,
  toUInt32(if(fk = 'f2' AND (toDate(ust) >= '2026-10-24' OR r % 50 = 0), 2, 1)) AS facet_version,
  if(is_session, '', uid) AS trace_id,
  if(is_session, concat('sess-', substring(uid, 1, 20)), if(k % 3 = 0, concat('sess-', substring(uid, 3, 20)), '')) AS session_id,
  multiIf(fk = 'f5', ['rule2'], fk = 'f4' AND in_rule2, ['rule1', 'rule2'], ['rule1']) AS rule_ids,
  multiIf(k % 100 < 90, 'production', k % 100 < 99, 'staging', 'langfuse-eval') AS environment,
  if(is_session, '', names[k % 12 + 1]) AS trace_name,
  ust2 AS unit_start_time,
  'automatic' AS trigger_type,
  CAST(multiIf(r % 100 < 88, 'complete', r % 100 < 99, 'not_applicable', 'insufficient_input') AS Enum8('complete' = 2, 'not_applicable' = 3, 'insufficient_input' = 4)) AS processing_state,
  if(r % 100 < 88, concat(pool[r % greatest(length(pool), 1) + 1], ' (', toString(r % 9973), ')'), '') AS summary,
  if(r % 100 < 88, CAST(arrayMap(i -> (intHash64(i + r * 1024) / 18446744073709551615. - 0.5) * 0.1, range(1024)) AS Array(BFloat16)), CAST([] AS Array(BFloat16))) AS embedding,
  lower(hex(cityHash64(uid, 'transcript'))) AS transcript_id, 'v3' AS transcript_version,
  'gpt-5.4-mini' AS summary_model, if(r % 100 < 88, 'text-embedding-3-large', '') AS embedding_model,
  map('input', toUInt64(900 + r % 4000), 'output', toUInt64(40 + r % 200)) AS provided_usage_details,
  map('input', toUInt64(900 + r % 4000), 'output', toUInt64(40 + r % 200), 'total', toUInt64(940 + r % 4200)) AS usage_details,
  CAST(map() AS Map(LowCardinality(String), Decimal(18, 12))) AS provided_cost_details,
  map('input', toDecimal128((900 + r % 4000) * 0.00000015, 12), 'output', toDecimal128((40 + r % 200) * 0.0000006, 12), 'total', toDecimal128((900 + r % 4000) * 0.00000015 + (40 + r % 200) * 0.0000006, 12)) AS cost_details,
  processed_at,
  concat('{"input":"assembled-transcript","transcriptBytes":', toString(2000 + r % 60000), '}') AS metadata,
  cityHash64(if(is_session, concat('sess-', substring(uid, 1, 20)), uid)) AS h
FROM (
  SELECT processed_at, p, d, n, fk, dup, cityHash64(p, d, n) AS k, k % 10 = 0 AS is_session,
    lower(hex(MD5(concat(p, '-', toString(d), '-', toString(n))))) AS uid,
    toDateTime64(d, 3) + toIntervalMillisecond(intDiv(k, 7) % 86400000) AS ust,
    intDiv(k, 101) % 100 < 20 AS in_rule2, cityHash64(k, fk) AS r,
    if(dup = 1 AND r % 1000 >= 3, ust + toIntervalMinute(2), ust) AS ust2
  FROM topics_schema_exp.arrivals
  WHERE processed_at >= {lo:DateTime64(3)} AND processed_at < {hi:DateTime64(3)}
);
