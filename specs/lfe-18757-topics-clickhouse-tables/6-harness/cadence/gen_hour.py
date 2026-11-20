# Prints the SQL for one hour of ingest: 60 one-minute flushes of summaries and online assignments, plus the
# nightly refit at 02:00 (a stable hash sample of up to 100k summaries per rule and facet over the last 7 days).
import sys, datetime as dt
start = dt.datetime.strptime(sys.argv[1], "%Y-%m-%d %H:%M")
first = int(sys.argv[2]) if len(sys.argv) > 2 else 0
only_asg = len(sys.argv) > 3 and sys.argv[3] == 'asg'
SN = "project_id, facet_id, facet_version, trace_id, session_id, rule_ids, environment, trace_name, unit_start_time, trigger_type, processing_state, summary, embedding, transcript_id, transcript_version, summary_model, embedding_model, provided_usage_details, usage_details, provided_cost_details, cost_details, processed_at, metadata"
AN = "project_id, facet_id, rule_id, clustering_run_id, facet_version, trace_id, session_id, environment, trace_name, unit_start_time, summary_processed_at, topic_id, topic_version_id, distance, runner_up_distance, origin, coordinates, assigned_at"
S = "SETTINGS max_threads = 4, max_insert_threads = 1, log_query_views = 1"
X = "topics_schema_exp."
def topic(seed_expr, run_day_expr, out_expr):
    return f"""if({out_expr}, '', concat('tp-', substring(facet_id, 3, 6), '-', toString(toUInt32(floor(50 * pow((intDiv(h, 7) % 10000) / 10000., 2)))))) AS topic_id,
      if({out_expr}, '', concat('tv-', substring(facet_id, 3, 6), '-', toString(toUInt32(floor(50 * pow((intDiv(h, 7) % 10000) / 10000., 2)))), '-', toString(intDiv(toRelativeDayNum({run_day_expr}), 5)))) AS topic_version_id,
      if({out_expr}, NULL, toFloat32((cityHash64(h, {seed_expr}) % 1000) / 2000.)) AS distance, toFloat32((cityHash64(h, {seed_expr}, 'r') % 997) / 1500.) AS runner_up_distance"""
out = []
for m in range(first, 60):
    lo = start + dt.timedelta(minutes=m); hi = lo + dt.timedelta(minutes=1)
    w = f"lo = '{lo:%Y-%m-%d %H:%M:%S}', hi = '{hi:%Y-%m-%d %H:%M:%S}'"
    tag = f"log_comment = 'ingest {lo:%Y-%m-%d %H:%M}'"
    if not only_asg: out.append(f"INSERT INTO {X}ingest_sum ({SN}) SELECT {SN} FROM {X}gen_window({w}) {S}, {tag}")
    out.append(f"""INSERT INTO {X}ingest_asg ({AN}) SELECT project_id, facet_id, rule AS rule_id, concat('run-', rule, '-', facet_id, '-', toString(toDate(processed_at - INTERVAL 2 HOUR))) AS clustering_run_id,
      facet_version, trace_id, session_id, environment, trace_name, unit_start_time, processed_at AS summary_processed_at,
      {topic("rule", "toDate(processed_at - INTERVAL 2 HOUR)", "cityHash64(h, rule) % 100 < 15")},
      CAST('online' AS Enum8('initial' = 1, 'online' = 2)) AS origin, CAST([] AS Array(Float32)) AS coordinates, processed_at + toIntervalSecond(1) AS assigned_at
    FROM (SELECT * FROM {X}gen_window({w}) WHERE processing_state = 'complete') ARRAY JOIN rule_ids AS rule {S}, {tag}""".replace("rule AS rule_id, project_id, facet_id, rule_id,", "rule AS rule_id, project_id, facet_id,"))
    if False:  # refit moved to refit.py (per map, sample before dedupe)
        D = lo.date(); frm = D - dt.timedelta(days=7)
        out.append(f"""INSERT INTO {X}ingest_asg ({AN})
    SELECT project_id, facet_id, rule AS rule_id, concat('run-', rule, '-', facet_id, '-', '{D}') AS clustering_run_id, facet_version, trace_id, session_id, environment, trace_name,
      unit_start_time, processed_at AS summary_processed_at,
      {topic("rule, 'fit'", f"toDate('{D}')", "cityHash64(h, rule, 'fit') % 100 < 25")},
      CAST('initial' AS Enum8('initial' = 1, 'online' = 2)) AS origin,
      [toFloat32((h % 100000) / 100000.), toFloat32((intDiv(h, 100000) % 100000) / 100000.)] AS coordinates, toDateTime64('{D} 02:00:00', 3) + toIntervalSecond(30) AS assigned_at
    FROM (
      SELECT s.*, s.unit_hash AS h, c.cnt AS cnt FROM (
        SELECT project_id, facet_id, facet_version, trace_id, session_id, environment, trace_name, unit_start_time, processed_at, unit_hash, rule
        FROM {X}c_sum_day ARRAY JOIN rule_ids AS rule
        WHERE unit_start_time >= '{frm} 00:00:00' AND unit_start_time < '{D} 00:00:00' AND processing_state = 'complete'
        ORDER BY facet_version DESC, processed_at DESC LIMIT 1 BY project_id, facet_id, rule, unit_hash
      ) AS s INNER JOIN (
        SELECT project_id, facet_id, rule, uniqExact(unit_hash) AS cnt FROM {X}c_sum_day ARRAY JOIN rule_ids AS rule
        WHERE unit_start_time >= '{frm} 00:00:00' AND unit_start_time < '{D} 00:00:00' AND processing_state = 'complete' GROUP BY ALL
      ) AS c ON s.project_id = c.project_id AND s.facet_id = c.facet_id AND s.rule = c.rule
      WHERE s.unit_hash < toUInt64(least(1., 100000. / c.cnt) * 18446744073709551615)
    )
    SETTINGS max_threads = 4, max_memory_usage = 6000000000, max_insert_threads = 1, max_block_size = 1000, min_insert_block_size_rows = 1000, min_insert_block_size_bytes = 0, max_insert_block_size = 1000, log_query_views = 1, log_comment = 'refit {D}'""")
print(";\n".join(out) + ";")
