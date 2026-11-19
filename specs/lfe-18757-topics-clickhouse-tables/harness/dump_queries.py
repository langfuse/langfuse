# Writes every benchmarked query, per configuration, to ../queries/<config>/<id>.sql with a header that points at
# the code on main that builds it. Placeholders stay as {name:Type}.
import os, re, sys
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here)
import queries
import importlib.util
spec = importlib.util.spec_from_file_location("run_final", os.path.join(here, "run_final.py")); rf = importlib.util.module_from_spec(spec); spec.loader.exec_module(rf)
T = "packages/shared/src/server/topics/clickhouse.ts"; R = "packages/shared/src/server/repositories/topic-results.ts"
source = {  # query id -> (function on main, file:line, use case)
    "Q07": ("getTopicResultCounts (summaries)", f"{R}:711", "Topics page counts"),
    "Q08": ("getTopicResultCounts (assignments)", f"{R}:730", "Topics page counts per topic"),
    "Q09": ("listCurrentRows candidates", f"{R}:314", "Trace list and topic page"),
    "Q10": ("listCurrentRows resolve", f"{R}:512", "Trace list and topic page"),
    "Q11": ("getLatestFacetSummaries", f"{T}:371", "Scatter plot, trace header"),
    "Q12": ("getTopicTraceUnitTimeRange", f"{T}:1316", "Trace header, public API trace lookup"),
    "Q13": ("getTopicSummaryCounts", f"{T}:765", "Nightly new-summaries check"),
    "Q15": ("getNewestTopicClusteringSummaries", f"{T}:580", "Nightly refit"),
    "Q18": ("readLatestTopicAssignments", f"{T}:1182", "Trace header topics"),
    "Q19": ("readCurrentTraceTopics", f"{T}:1210", "Tracing table topic column"),
    "Q20": ("currentTopicTraceIdsCondition", f"{T}:1256", "Tracing table topic filter"),
    "Q21": ("readTopicMapAssignments", f"{T}:1123", "Scatter plot points"),
    "Q22": ("readTopicRunTraceIds", f"{T}:1085", "Refit: previous run's traces"),
    "Q23": ("readTopicAssignments", f"{T}:1149", "Fit write readback"),
    "Q33": ("deleteTopicResultsForTraces", "worker/src/features/traces/processClickhouseTraceDelete.ts:30", "Trace deletion"),
}
def where(qid):
    return source.get(qid, ("", "", ""))
TABLES = {"topics_schema_exp.sum_main": "topic_facet_summaries", "topics_schema_exp.asg_main": "topic_assignments",
          "topics_schema_exp.sum_M": "topic_facet_summaries", "topics_schema_exp.asg_M": "topic_assignments", "topics_schema_exp.sum_M_ptr": "topic_facet_summary_pointers",
          "topics_schema_exp.sum_A": "topic_facet_summaries", "topics_schema_exp.asg_AB": "topic_assignments", "topics_schema_exp.asg_AB_by_time": "topic_assignments_by_trace"}
out_root = os.path.join(here, "..", "queries")
for cn, o in rf.CONFIGS.items():
    q = queries.build(o)
    q = rf.improve(o, q) if o["improved"] else q
    d = os.path.join(out_root, cn.replace(" + ", "-").replace(" ", "-"))
    os.makedirs(d, exist_ok=True)
    for name, sql in q.items():
        if o["name"] in ("main", "M") and name.startswith("Q15'"):
            sql = sql.replace("unit_hash <", "cityHash64(if(trace_id = '', session_id, trace_id)) <")
        for k in sorted(TABLES, key=len, reverse=True):
            sql = sql.replace(k, TABLES[k])
        qid = name.split(" ")[0].rstrip("'").replace("Q19L", "Q19")
        fn, loc, use = where(qid[:3])
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        header = f"-- {name}\n-- Built on main by {fn} ({loc}); use case: {use}\n-- Configuration: {cn}\n"
        if name.startswith("Q15'"): header += "-- New query: stable 100k hash sample for the nightly refit (not on main).\n"
        if name.startswith("Q19L"): header += "-- New query: the trace's latest placement in any run (main only reads the current run).\n"
        open(os.path.join(d, f"{slug}.sql"), "w").write(header + "\n" + re.sub(r"\n\s*\n", "\n", sql.strip()) + "\n")
print("written to", os.path.normpath(out_root))
