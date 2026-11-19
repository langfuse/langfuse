# Four configurations x two projects: main schema + main queries, main schema + improved queries,
# meeting schema + improved queries, proposal (option A) + improved queries.
import sys, uuid, importlib.util
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import queries
spec = importlib.util.spec_from_file_location("rp", os.path.join(os.path.dirname(os.path.abspath(__file__)), "replay_lib.py")); rp = importlib.util.module_from_spec(spec); spec.loader.exec_module(rp)
X = "topics_schema_exp."
CONFIGS = {
  "1 main + main queries":   dict(name="main", S=X+"sum_main", A=X+"asg_main", E=X+"sum_main", rule=False, improved=False),
  "2 main + improved":       dict(name="main", S=X+"sum_main", A=X+"asg_main", E=X+"sum_main", rule=False, improved=True),
  "3 meeting + improved":    dict(name="M",    S=X+"sum_M",    A=X+"asg_M",    E=X+"sum_M",    rule=True,  improved=True, ptr=X+"sum_M_ptr"),
  "4 proposal + improved":   dict(name="A",    S=X+"sum_A",    A=X+"asg_AB",   E=X+"sum_A",    rule=True,  improved=True, lookup=X+"asg_AB_by_time")}
MIDDLE = "WHERE project_id = {projectId:String}\n        AND (facet_id, trace_id"
def bound(sql, lo, hi):  # bound the dedupe's middle level by the query window (+2 days for late arrivals)
    return sql.replace(MIDDLE, f"WHERE project_id = {{projectId:String}} AND unit_start_time >= {{{lo}:DateTime64(3)}} - INTERVAL 2 DAY AND unit_start_time < {{{hi}:DateTime64(3)}} + INTERVAL 2 DAY\n        AND (facet_id, trace_id")
ENV = queries.ENV
def improve(o, q):
    S = o["S"]; out = {}
    for name, sql in q.items():
        sql = sql.replace("length(embedding) AS dimensions", "embedding.size0 AS dimensions")
        if name.startswith("Q10"): sql = bound(sql, "cfrom", "cto")
        if name.startswith("Q13"): sql = bound(sql, "d1", "to")
        if name.startswith("Q15 "): sql = bound(sql, "f7", "to")
        if name.startswith("Q09 list candidates"):   # newest first: read the last day first, widen only when it has fewer rows than the batch
            sql = sql.replace("{from:DateTime64(3)}", "{d1:DateTime64(3)}")
        if name.startswith("Q11 scatter"):           # facet version is pinned by the run: one dedupe level is enough
            sql = f"""SELECT project_id, facet_id, facet_version, trace_id, session_id, processing_state, summary, environment, unit_start_time, processed_at FROM {S}
              WHERE project_id = {{projectId:String}} AND {queries.W} AND facet_id = {{facetId:String}} AND facet_version = {{facetVersion:UInt32}} AND trace_id IN {{traceIds:Array(String)}}
              ORDER BY processed_at DESC LIMIT 1 BY facet_id, trace_id, if(trace_id = '', session_id, '')"""
        if o.get("ptr") and name.startswith("Q12"):
            sql = f"SELECT count(), min(unit_start_time), max(unit_start_time) FROM {o['ptr']} WHERE project_id = {{projectId:String}} AND unit_start_time >= {{wfrom:DateTime64(3)}} AND unit_start_time < {{to:DateTime64(3)}} AND trace_id IN {{oneTrace:Array(String)}}"
        if o.get("ptr") and name == "Q33 delete: bounds lookup (10 ids, no time)":
            sql = f"SELECT min(unit_start_time), max(unit_start_time), count() FROM {o['ptr']} WHERE project_id = {{projectId:String}} AND trace_id IN ({{delIds:Array(String)}})"
        out[name] = sql
    # tracing table topic column with "latest placement in any run" semantics; the proposal reads its time-ordered lookup table
    T = o.get("lookup", o["A"]); by = "facet_id, rule_id, trace_id" if o["rule"] else "facet_id, trace_id"
    rule = " AND rule_id IN {allRules:Array(String)}" if o["rule"] else ""
    for label, page, lo in (("newest page", "pageTraces", "pfrom"), ("older page", "oldTraces", "ofrom")):
        out[f"Q19L tracing topics, latest placement, {label}"] = f"""SELECT trace_id, facet_id, topic_id, clustering_run_id FROM {T}
          WHERE project_id = {{projectId:String}} AND unit_start_time >= {{{lo}:DateTime64(3)}} AND unit_start_time < {{to:DateTime64(3)}}
            AND facet_id IN {{allFacets:Array(String)}} AND trace_id IN {{{page}:Array(String)}}{rule}
          ORDER BY assigned_at DESC, origin DESC LIMIT 1 BY {by}"""
    return out
def main():
    P = sys.argv[1]; only = sys.argv[2:] or list(CONFIGS)
    fid = lambda fk: rp.ch(f"SELECT concat('cm', substring(lower(hex(cityHash64('{P}', '{fk}'))), 1, 16), 'fct', '{fk}')", fmt="TSV").strip()
    F = fid("f1"); FACETS = [fid(f) for f in ["f1", "f2", "f3", "f4", "f5"]]
    MAPS = [("rule1", f) for f in FACETS[:4]] + [("rule2", f) for f in FACETS[3:]]
    RUN = f"run-rule1-{F}-2026-11-02"; PREV = f"run-rule1-{F}-2026-11-01"
    FROM30, TO, F7 = "2026-10-04 00:00:00.000", "2026-11-03 00:00:00.000", "2026-10-27 00:00:00.000"
    def col(sql): return [l.split("\t") for l in rp.ch(sql, fmt="TSV").strip().splitlines()]
    cand = col(f"SELECT facet_id, trace_id, toString(unit_start_time) FROM {X}sum_A WHERE project_id='{P}' AND facet_id='{F}' AND unit_start_time >= '{FROM30}' AND unit_start_time < '{TO}' AND trace_id != '' AND NOT startsWith(environment, 'langfuse') ORDER BY toStartOfMinute(unit_start_time) DESC, unit_start_time DESC, trace_id DESC, facet_id DESC LIMIT 200")
    disc = [r[0] for r in col(f"SELECT DISTINCT trace_id FROM {X}asg_main WHERE project_id='{P}' AND facet_id='{F}' AND clustering_run_id='{RUN}' AND origin='initial' AND trace_id != '' ORDER BY trace_id LIMIT 1000")]
    # tracing table pages: the newest 100 traces, and 100 traces from three days earlier
    page = col(f"SELECT trace_id, toString(unit_start_time), toString(unit_start_time) FROM {X}sum_A WHERE project_id='{P}' AND facet_id='{F}' AND unit_start_time >= '2026-11-02 23:00:00' AND unit_start_time < '{TO}' AND trace_id != '' ORDER BY unit_start_time DESC LIMIT 100")
    old = col(f"SELECT trace_id, toString(unit_start_time) FROM {X}sum_A WHERE project_id='{P}' AND facet_id='{F}' AND unit_start_time >= '2026-10-30 12:00:00' AND unit_start_time < '2026-10-30 13:00:00' AND trace_id != '' ORDER BY unit_start_time DESC LIMIT 100")
    n30 = int(rp.ch(f"SELECT count() FROM {X}sum_A WHERE project_id='{P}' AND facet_id='{F}' AND unit_start_time >= '{FROM30}' AND unit_start_time < '{TO}' AND processing_state='complete'", fmt="TSV"))
    n7 = int(rp.ch(f"SELECT count() FROM {X}sum_A WHERE project_id='{P}' AND facet_id='{F}' AND unit_start_time >= '{F7}' AND unit_start_time < '{TO}' AND processing_state='complete'", fmt="TSV"))
    topic = rp.ch(f"SELECT topic_id FROM {X}asg_AB WHERE project_id='{P}' AND facet_id='{F}' AND rule_id='rule1' AND clustering_run_id='{RUN}' AND topic_id != '' GROUP BY topic_id ORDER BY count() DESC LIMIT 1 OFFSET 5", fmt="TSV").strip()
    M64 = 18446744073709551615
    params = dict(rp.common, projectId=P, **{
      "from": FROM30, "to": TO, "f7": F7, "d1": "2026-11-02 00:00:00.000", "wfrom": "2026-08-02 00:00:00.000",
      "cfrom": min(c[2] for c in cand), "cto": max(c[2] for c in cand)[:19] + ".999",
      "tfrom": page[0][1], "tto": page[0][2][:19] + ".999", "pfrom": "2026-10-31 23:00:00.000", "pto": "2026-11-03 00:00:00.000", "ofrom": "2026-10-28 12:00:00.000",
      "facetIds": rp.arr([F]), "versions": "[1]", "runIds": rp.arr([RUN]), "publishedRunIds": rp.arr([RUN]),
      "ruleIds": rp.arr(["rule1"]), "ruleOne": rp.arr(["rule1"]), "topicIds": rp.arr([topic]),
      "p0": rp.arr(sorted({c[1] for c in cand})), "p1": rp.arr([c[0] for c in cand]), "p2": rp.arr([c[1] for c in cand]), "p3": rp.arr_dt([c[2] for c in cand]),
      "facetId": F, "facetVersion": "1", "traceIds": rp.arr(disc), "emptyIds": rp.arr([""] * len(disc)),
      "oneTrace": rp.arr([page[0][0]]), "facetRuns": rp.arr([RUN]),
      "pageTraces": rp.arr([p[0] for p in page]), "oldTraces": rp.arr([p[0] for p in old]), "allRules": rp.arr(["rule1", "rule2"]), "allFacets": rp.arr(FACETS), "allRuns": rp.arr([f"run-{r}-{f}-2026-11-02" for r, f in MAPS]),
      "runId": RUN, "prevRun": PREV, "delIds": rp.arr([p[0] for p in page[:10]]),
      "embeddingModel": "text-embedding-3-large", "embeddingDimensions": "1024",
      "k30": str(int(min(1, 100000 / n30) * M64)), "k7": str(int(min(1, 100000 / n7) * M64))})
    CODE_SETTINGS = {"Q15 refit today: newest 16k, 7d step": " SETTINGS max_threads = 2, max_execution_time = 60"}
    run_id = uuid.uuid4().hex[:8]
    print(f"project {P}: facet rows 30d {n30} / 7d {n7}, topic {topic}, run {RUN}", file=sys.stderr)
    for cn in only:
        o = CONFIGS[cn]
        q = queries.build(o)
        if o["improved"]: q = improve(o, q)
        for name, sql in q.items():
            if o["name"] in ("main", "M") and name.startswith("Q15'"):  # no hash in the primary key: the stable sample is computed on the fly
                sql = sql.replace("unit_hash <", "cityHash64(if(trace_id = '', session_id, trace_id)) <")
            sql += CODE_SETTINGS.get(name, "")
            used = {k: v for k, v in params.items() if "{" + k + ":" in sql}
            out = rp.ch(sql, used, tag=f"{run_id}|{cn}|{name}")
            if out.startswith("ERR"): print(cn, "|", name, "|", out[:200], file=sys.stderr)
    rp.ch("SYSTEM FLUSH LOGS", fmt=None)
    print(rp.ch(f"""SELECT splitByChar('|', log_comment)[3] AS query, splitByChar('|', log_comment)[2] AS config, formatReadableSize(read_bytes) AS bytes, read_rows AS rows, query_duration_ms AS ms, formatReadableSize(memory_usage) AS mem, result_rows
      FROM system.query_log WHERE type = 'QueryFinish' AND startsWith(log_comment, '{run_id}|') ORDER BY query, config""", fmt="TSVWithNames"))

if __name__ == "__main__":
    main()
