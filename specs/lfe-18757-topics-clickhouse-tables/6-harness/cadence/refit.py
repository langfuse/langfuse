# Nightly refit for night D: per (project, facet, rule) map, a stable hash sample of up to 100k complete summaries from
# the 7 days before D, read from the day layout the way the proposed refit reads, written as 1,000-row batches.
import sys, datetime as dt, subprocess
D = dt.date.fromisoformat(sys.argv[1]); frm = D - dt.timedelta(days=7)
CH = ["docker", "exec", "-i", "langfuse-clickhouse", "clickhouse-client", "--user", "clickhouse", "--password", "clickhouse"]
X = "topics_schema_exp."
W = f"unit_start_time >= '{frm} 00:00:00' AND unit_start_time < '{D} 00:00:00' AND processing_state = 'complete' AND processed_at < '{D} 02:00:00'"
counts = subprocess.run(CH + ["-q", f"SELECT project_id, facet_id, rule, uniqExact(unit_hash) FROM {X}c_sum_day ARRAY JOIN rule_ids AS rule WHERE {W} GROUP BY ALL FORMAT TSV SETTINGS max_memory_usage = 6000000000, log_comment = 'refit-count {D}'"], capture_output=True, text=True, check=True, stdin=subprocess.DEVNULL).stdout.split("\n")
AN = "project_id, facet_id, rule_id, clustering_run_id, facet_version, trace_id, session_id, environment, trace_name, unit_start_time, summary_processed_at, topic_id, topic_version_id, distance, runner_up_distance, origin, coordinates, assigned_at"
stmts = []
for line in filter(None, counts):
    p, f, rule, n = line.split("\t"); k = int(min(1.0, 100000 / int(n)) * 18446744073709551615)
    t = "toUInt32(floor(50 * pow((intDiv(h, 7) % 10000) / 10000., 2)))"; out = f"cityHash64(h, '{rule}', 'fit') % 100 < 25"
    stmts.append(f"""INSERT INTO {X}ingest_asg ({AN})
SELECT project_id, facet_id, '{rule}', 'run-{rule}-{f}-{D}', facet_version, trace_id, session_id, environment, trace_name, unit_start_time, processed_at,
  if({out}, '', concat('tp-', substring(facet_id, 3, 6), '-', toString({t}))),
  if({out}, '', concat('tv-', substring(facet_id, 3, 6), '-', toString({t}), '-', toString(intDiv(toRelativeDayNum(toDate('{D}')), 5)))),
  if({out}, NULL, toFloat32((cityHash64(h, '{rule}', 'fit') % 1000) / 2000.)), toFloat32((cityHash64(h, '{rule}', 'fit', 'r') % 997) / 1500.),
  'initial', [toFloat32((h % 100000) / 100000.), toFloat32((intDiv(h, 100000) % 100000) / 100000.)], toDateTime64('{D} 02:00:00', 3) + toIntervalSecond(30)
FROM (SELECT *, unit_hash AS h FROM {X}c_sum_day
      WHERE project_id = '{p}' AND facet_id = '{f}' AND has(rule_ids, '{rule}') AND {W} AND unit_hash < {k}
      ORDER BY facet_version DESC, processed_at DESC LIMIT 1 BY unit_hash)
SETTINGS max_threads = 4, max_memory_usage = 6000000000, max_insert_threads = 1, max_block_size = 1000, min_insert_block_size_rows = 1000, min_insert_block_size_bytes = 0, max_insert_block_size = 1000, log_query_views = 1, log_comment = 'refit {D} {p} {rule} {f}'""")
print(";\n".join(stmts) + ";")
