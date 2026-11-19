# Writes every benchmarked query, per configuration, to ../queries/<config>/<id>.sql with a header that points at
# the code on main that builds it (from ../main-query-catalogue.md). Placeholders stay as {name:Type}.
import os, re, sys
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here)
import queries
import importlib.util
spec = importlib.util.spec_from_file_location("run_final", os.path.join(here, "run_final.py")); rf = importlib.util.module_from_spec(spec); spec.loader.exec_module(rf)
catalogue = open(os.path.join(here, "..", "main-query-catalogue.md")).read()
source = {}
for m in re.finditer(r"^\| (Q\d\d) \| (.+?) \| (.+?) \|", catalogue, re.M):
    cell = m.group(2)
    loc = re.search(r"\(([^)]*\.ts:\d+)\)", cell)
    source[m.group(1)] = (re.sub(r"\s*\([^)]*\.ts:\d+\)", "", cell).replace("`", "").strip(), loc.group(1) if loc else "", m.group(3).strip())
CODE = {"topics/clickhouse.ts": "packages/shared/src/server/topics/clickhouse.ts", "topic-results.ts": "packages/shared/src/server/repositories/topic-results.ts"}
def where(qid):
    fn, loc, use = source.get(qid, ("", "", ""))
    for short, full in CODE.items():
        loc = loc.replace(short, full)
    return fn, loc, use
TABLES = {"topics_schema_exp.sum_main": "topic_facet_summaries", "topics_schema_exp.asg_main": "topic_assignments",
          "topics_schema_exp.sum_M": "topic_facet_summaries", "topics_schema_exp.asg_M": "topic_assignments", "topics_schema_exp.sum_M_ptr": "topic_facet_summary_pointers",
          "topics_schema_exp.sum_A": "topic_facet_summaries", "topics_schema_exp.asg_AB": "topic_assignments", "topics_schema_exp.asg_AB_by_time": "topic_assignments_by_trace"}
out_root = os.path.join(here, "..", "queries")
for cn, o in rf.CONFIGS.items():
    q = queries.build(o)
    q = rf.improve(o, q) if o["improved"] else q
    d = os.path.join(out_root, cn.split(" ", 1)[1].replace(" + ", "-").replace(" ", "-"))
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
