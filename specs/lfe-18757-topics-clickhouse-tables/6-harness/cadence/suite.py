# Read suite for the cadence test. Usage: suite.py <phase-label>
import sys, uuid, importlib.util
H = "6-harness"
spec = importlib.util.spec_from_file_location("rp", f"{H}/replay_lib.py"); rp = importlib.util.module_from_spec(spec); spec.loader.exec_module(rp)
sys.path.insert(0, H); import queries
phase = sys.argv[1]; X = "topics_schema_exp."; M64 = 18446744073709551615; rid = uuid.uuid4().hex[:8]
SUM = queries.SUMCOLS
ENV = "AND NOT startsWith(environment, 'langfuse') AND environment != 'llm-as-a-judge'"
NOW, W7, W14, D1 = "2026-11-03 00:00:00", "2026-10-27 00:00:00", "2026-10-20 00:00:00", "2026-11-02 00:00:00"
def scalar(sql): return rp.ch(sql, fmt="TSV").strip()
results = []
def run(project, group, name, layout, sql):
    for rep in (1, 2):
        out = rp.ch(sql, tag=f"{rid}|{phase}|{project}|{group}|{name}|{layout}|{rep}")
        if out.startswith("ERR"): print("ERR", project, name, layout, out[:200], file=sys.stderr); break
for P in ("cmlarge000000000000000001", "cmsmall000000000000000001"):
    pl = "1M/day" if "large" in P else "10k/day"
    F = scalar(f"SELECT concat('cm', substring(lower(hex(cityHash64('{P}', 'f1'))), 1, 16), 'fct', 'f1')")
    FACETS = [scalar(f"SELECT concat('cm', substring(lower(hex(cityHash64('{P}', '{f}'))), 1, 16), 'fct', '{f}')") for f in ("f1", "f2", "f3", "f4", "f5")]
    f = f"project_id = '{P}' AND facet_id = '{F}'"
    n7 = int(scalar(f"SELECT uniqExact(unit_hash) FROM {X}c_sum_day WHERE {f} AND unit_start_time >= '{W7}' AND unit_start_time < '{NOW}' AND processing_state = 'complete'"))
    k7 = int(min(1, 100000 / max(n7, 1)) * M64)
    R = f"run-rule1-{F}-2026-11-02"; RP = f"run-rule1-{F}-2026-11-01"
    topic = scalar(f"SELECT topic_id FROM {X}c_asg_prop WHERE project_id = '{P}' AND facet_id = '{F}' AND clustering_run_id = '{R}' AND topic_id != '' GROUP BY topic_id ORDER BY count() DESC LIMIT 1 OFFSET 5")
    cand = scalar(f"SELECT groupArray(trace_id) FROM (SELECT trace_id FROM {X}c_sum_day WHERE {f} AND unit_start_time >= '2026-11-02 23:50:00' AND unit_start_time < '{NOW}' AND trace_id != '' ORDER BY unit_start_time DESC LIMIT 200)")
    disc = scalar(f"SELECT groupArray(trace_id) FROM (SELECT DISTINCT trace_id FROM {X}c_asg_prop WHERE project_id = '{P}' AND facet_id = '{F}' AND clustering_run_id = '{R}' AND origin = 'initial' AND trace_id != '' ORDER BY trace_id LIMIT 1000)")
    newest = scalar(f"SELECT groupArray(trace_id) FROM (SELECT trace_id FROM {X}c_sum_day WHERE {f} AND unit_start_time >= '2026-11-02 23:00:00' AND unit_start_time < '{NOW}' AND trace_id != '' ORDER BY unit_start_time DESC LIMIT 100)")
    older = scalar(f"SELECT groupArray(trace_id) FROM (SELECT trace_id FROM {X}c_sum_day WHERE {f} AND unit_start_time >= '2026-10-30 12:00:00' AND unit_start_time < '2026-10-30 13:00:00' AND trace_id != '' ORDER BY unit_start_time DESC LIMIT 100)")
    one = scalar(f"SELECT any(trace_id) FROM {X}c_sum_day WHERE {f} AND unit_start_time >= '2026-11-02 10:00:00' AND unit_start_time < '2026-11-02 10:01:00' AND trace_id != ''")
    ten = scalar(f"SELECT groupArray(trace_id) FROM (SELECT trace_id FROM {X}c_sum_day WHERE {f} AND unit_start_time >= '2026-10-29' AND unit_start_time < '2026-10-30' AND trace_id != '' ORDER BY cityHash64(trace_id) LIMIT 10)")
    runs7 = "[" + ",".join(f"'run-rule1-{F}-2026-{m:02d}-{d:02d}'" for m, d in [(10, x) for x in range(27, 32)] + [(11, 1), (11, 2)]) + "]"
    # summaries: minute (call layout), hour, day
    S = {"minute (call)": X + "c_sum_min", "hour": X + "c_sum_hour", "day": X + "c_sum_day"}
    sq = {
     "refit: stable 100k sample, 7 days": f"SELECT {SUM} FROM {{T}} WHERE {f} AND unit_start_time >= '{W7}' AND unit_start_time < '{NOW}' AND processing_state = 'complete' AND embedding.size0 = 1024 {ENV} AND unit_hash < {k7} ORDER BY facet_version DESC, processed_at DESC LIMIT 1 BY trace_id, session_id",
     "counts by state, 7 days": f"SELECT processing_state, uniqCombined(trace_id) FROM {{T}} WHERE {f} AND unit_start_time >= '{W7}' AND unit_start_time < '{NOW}' AND trace_id != '' {ENV} GROUP BY processing_state",
     "counts by state, 14 days": f"SELECT processing_state, uniqCombined(trace_id) FROM {{T}} WHERE {f} AND unit_start_time >= '{W14}' AND unit_start_time < '{NOW}' AND trace_id != '' {ENV} GROUP BY processing_state",
     "newest 200, last day": f"SELECT trace_id, unit_start_time FROM {{T}} WHERE {f} AND unit_start_time >= '{D1}' AND unit_start_time < '{NOW}' AND trace_id != '' {ENV} ORDER BY unit_start_time DESC, trace_id DESC LIMIT 200",
     "newest 200, last hour": f"SELECT trace_id, unit_start_time FROM {{T}} WHERE {f} AND unit_start_time >= '2026-11-02 23:00:00' AND unit_start_time < '{NOW}' AND trace_id != '' {ENV} ORDER BY unit_start_time DESC, trace_id DESC LIMIT 200",
     "list resolve: 200 traces, 10-minute span": f"SELECT trace_id, summary, processing_state, processed_at FROM {{T}} WHERE {f} AND unit_start_time >= '2026-11-02 23:50:00' AND unit_start_time < '{NOW}' AND trace_id IN {cand} ORDER BY facet_version DESC, processed_at DESC LIMIT 1 BY trace_id",
     "summaries in a 1-hour window": f"SELECT trace_id, summary FROM {{T}} WHERE {f} AND unit_start_time >= '2026-11-02 10:00:00' AND unit_start_time < '2026-11-02 11:00:00'",
     "scatter summaries: 1,000 run ids, 7 days": f"SELECT trace_id, summary, processed_at FROM {{T}} WHERE {f} AND unit_start_time >= '{W7}' AND unit_start_time < '{NOW}' AND trace_id IN {disc} ORDER BY facet_version DESC, processed_at DESC LIMIT 1 BY trace_id",
     "trace header: one trace, all facets, 93 days": f"SELECT facet_id, summary FROM {{T}} WHERE project_id = '{P}' AND unit_start_time >= '2026-08-02' AND unit_start_time < '{NOW}' AND trace_id = '{one}'",
     "delete lookup: 10 ids, no time": f"SELECT min(unit_start_time), max(unit_start_time), count() FROM {{T}} WHERE project_id = '{P}' AND trace_id IN {ten}",
     "nightly: new summaries in the last day": f"SELECT facet_version, count() FROM {{T}} WHERE {f} AND unit_start_time >= '{D1}' AND unit_start_time < '{NOW}' AND processing_state = 'complete' AND embedding.size0 = 1024 GROUP BY facet_version",
    }
    for name, tpl in sq.items():
        for lay, T in S.items(): run(pl, "summaries", name, lay, tpl.format(T=T))
    # the call layout's pointer table for lookups without a time range
    run(pl, "summaries", "trace header: one trace, all facets, 93 days", "minute (call) via pointer MV", f"SELECT count(), min(unit_start_time), max(unit_start_time) FROM {X}c_sum_min_ptr WHERE project_id = '{P}' AND unit_start_time >= '2026-08-02' AND unit_start_time < '{NOW}' AND trace_id = '{one}'")
    run(pl, "summaries", "delete lookup: 10 ids, no time", "minute (call) via pointer MV", f"SELECT min(unit_start_time), max(unit_start_time), count() FROM {X}c_sum_min_ptr WHERE project_id = '{P}' AND trace_id IN {ten}")
    # assignments: the call's key vs the proposal's key
    A = {"call key": X + "c_asg_call", "proposal key": X + "c_asg_prop"}
    run_f = f"project_id = '{P}' AND facet_id = '{F}' AND unit_start_time >= '{W7}' AND unit_start_time < '{NOW}'"
    aq = {
     "map counts, current run": f"SELECT topic_id, count() FROM {{T}} WHERE {run_f}{{r}} AND clustering_run_id = '{R}' GROUP BY topic_id",
     "topic page: newest 200 of a topic": f"SELECT trace_id, unit_start_time FROM {{T}} WHERE {run_f}{{r}} AND clustering_run_id = '{R}' AND topic_id = '{topic}' ORDER BY unit_start_time DESC LIMIT 200",
     "tracing table topic filter, 7 days": f"SELECT count() FROM (SELECT DISTINCT trace_id FROM {{T}} WHERE {run_f}{{r}} AND clustering_run_id = '{R}' AND topic_id = '{topic}')",
     "scatter points: run's clustered rows": f"SELECT trace_id, coordinates, topic_id FROM {{T}} WHERE {run_f}{{r}} AND clustering_run_id = '{R}' AND origin = 'initial'",
     "refit: previous run's traces": f"SELECT DISTINCT trace_id FROM {{T}} WHERE project_id = '{P}' AND facet_id = '{F}' AND unit_start_time >= '2026-10-26 00:00:00' AND unit_start_time < '{NOW}'{{r}} AND clustering_run_id = '{RP}' AND origin = 'initial'",
     "fit readback: 1,000 ids": f"SELECT trace_id, topic_id, assigned_at FROM {{T}} WHERE {run_f}{{r}} AND clustering_run_id = '{R}' AND trace_id IN {disc} ORDER BY assigned_at DESC LIMIT 1 BY trace_id",
     "topic growth: 7 runs of one rule": f"SELECT topic_id, toDate(unit_start_time) AS d, count() FROM {{T}} WHERE {run_f}{{r}} AND clustering_run_id IN {runs7} AND origin = 'online' GROUP BY topic_id, d",
     "trace header topics: one trace": f"SELECT clustering_run_id, topic_id FROM {{T}} WHERE project_id = '{P}' AND facet_id = '{F}' AND unit_start_time >= '2026-11-02 09:00:00' AND unit_start_time < '2026-11-02 11:00:00'{{r}} AND clustering_run_id = '{R}' AND trace_id = '{one}'",
    }
    for name, tpl in aq.items():
        for lay, T in A.items():
            r = " AND rule_id = 'rule1'" if lay == "call key" else ""   # the call key keeps rule_id as a bloom filter
            run(pl, "assignments", name, lay, tpl.format(T=T, r=r))
    # tracing table topic column, latest placement in any run (call key: its own table; proposal: the lookup table)
    for label, page, lo in (("newest page", newest, "2026-10-31 23:00:00"), ("page from 3 days earlier", older, "2026-10-28 12:00:00")):
        for lay, T in (("call key", X + "c_asg_call"), ("proposal key via lookup MV", X + "c_asg_prop_lookup")):
            run(pl, "assignments", f"tracing table topic column, {label}", lay, f"SELECT trace_id, facet_id, topic_id FROM {T} WHERE project_id = '{P}' AND unit_start_time >= '{lo}' AND unit_start_time < '{NOW}' AND facet_id IN {rp.arr(FACETS)} AND trace_id IN {page} ORDER BY assigned_at DESC LIMIT 1 BY facet_id, rule_id, trace_id")
rp.ch("SYSTEM FLUSH LOGS", fmt=None)
print(rp.ch(f"""SELECT splitByChar('|', log_comment)[3] AS project, splitByChar('|', log_comment)[4] AS grp, splitByChar('|', log_comment)[5] AS query, splitByChar('|', log_comment)[6] AS layout,
    formatReadableSize(min(read_bytes)) AS bytes, min(read_rows) AS rows, min(ProfileEvents['SelectedParts']) AS parts, min(ProfileEvents['SelectedMarks']) AS granules,
    groupArray(query_duration_ms) AS ms_runs, formatReadableSize(max(memory_usage)) AS mem, any(result_rows) AS result_rows
  FROM system.query_log WHERE type = 'QueryFinish' AND startsWith(log_comment, '{rid}|')
  GROUP BY project, grp, query, layout ORDER BY project, grp, query, layout""", fmt="TSVWithNames"))
